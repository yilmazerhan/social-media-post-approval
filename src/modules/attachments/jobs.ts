/**
 * `TEMP_FILE_CLEANUP` and `ORPHAN_ATTACHMENT_CLEANUP` — ARCHITECTURE.md §7's
 * job types for this module (pipeline step 7 and API.md's "removed by the
 * orphan job"). Registered against the generic queue in `src/jobs/queue.ts`
 * as a side effect of importing this file — `src/jobs/worker.ts` imports it
 * alongside every other module that owns a job type.
 */
import { readdir, stat as fsStat, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "@/server/config";
import { prisma } from "@/server/db";
import { workerLogger as logger } from "@/server/logger";
import { registerJobHandler } from "@/jobs/queue";
import { getFileStorage } from "./file-storage";

/** Step 7 — abandoned partial-upload temp files, swept by age. */
async function tempFileCleanup(): Promise<void> {
  const cutoff = Date.now() - config.UPLOAD_TMP_TTL_MINUTES * 60 * 1000;
  let entries: string[];
  try {
    entries = await readdir(config.STORAGE_TMP_PATH);
  } catch {
    return;
  }
  for (const entry of entries) {
    const filePath = path.join(config.STORAGE_TMP_PATH, entry);
    const info = await fsStat(filePath).catch(() => null);
    if (info && info.mtimeMs < cutoff) {
      await unlink(filePath).catch(() => {});
    }
  }
}

/**
 * Attachments the DELETE endpoint marked (`deletedAt` set) or that were
 * uploaded and never attached to anything (abandoned drafts) — physically
 * removes the file(s) and the row. No dedicated config var exists for
 * "how old is an abandoned upload" (CONFIGURATION.md doesn't define one),
 * so this reuses `UPLOAD_TMP_TTL_MINUTES` rather than inventing a second
 * knob the docs never asked for.
 */
async function orphanAttachmentCleanup(): Promise<void> {
  const cutoff = new Date(
    Date.now() - config.UPLOAD_TMP_TTL_MINUTES * 60 * 1000,
  );
  const storage = getFileStorage();
  const candidates = await prisma.attachment.findMany({
    where: {
      OR: [
        { deletedAt: { not: null } },
        { status: "TEMPORARY", createdAt: { lt: cutoff } },
      ],
    },
  });

  for (const attachment of candidates) {
    try {
      await storage.delete(attachment.storageKey);
      if (attachment.thumbnailKey)
        await storage.delete(attachment.thumbnailKey);
      if (
        attachment.posterKey &&
        attachment.posterKey !== attachment.thumbnailKey
      ) {
        await storage.delete(attachment.posterKey);
      }
      await prisma.attachment.delete({ where: { id: attachment.id } });
    } catch (err) {
      // A row can legitimately turn ATTACHED between this query and this
      // delete (a concurrent submit) — skip it this run rather than
      // failing the whole sweep; it won't match the query again.
      logger.warn(
        { attachmentId: attachment.id, err },
        "orphan cleanup skipped one attachment",
      );
    }
  }
}

registerJobHandler("TEMP_FILE_CLEANUP", tempFileCleanup);
registerJobHandler("ORPHAN_ATTACHMENT_CLEANUP", orphanAttachmentCleanup);
