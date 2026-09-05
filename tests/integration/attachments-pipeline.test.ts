// @vitest-environment node
//
// jsdom's own Request/FormData/Blob shims (the project's default test
// environment) don't produce a real streamable multipart body — busboy
// never sees a "file" part under jsdom, even for a genuinely valid
// upload. This file exercises real Node server code (streams, busboy,
// child_process), so it needs Node's real fetch primitives, not jsdom's.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { FileRejectedError } from "@/server/http/handler";
import { runUploadPipeline } from "@/modules/attachments/pipeline";
import { getFileStorage } from "@/modules/attachments/file-storage";

const execFileAsync = promisify(execFile);

/**
 * The full seven-step upload pipeline (ARCHITECTURE.md §6) against real
 * files — including the crafted-file rejection cases Phase 9's exit
 * criterion names explicitly: extension/MIME mismatch, polyglot, SVG,
 * `../` paths (covered separately in file-storage.test.ts's
 * resolveStorageKey unit tests), and oversize.
 */

let uploaderId: string;
let tmpVideoDir: string;
const createdAttachmentIds: string[] = [];

function toBody(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): { body: ReadableStream<Uint8Array>; contentType: string } {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType }),
    filename,
  );
  const request = new Request("http://localhost/upload", {
    method: "POST",
    body: formData,
  });
  return {
    body: request.body as ReadableStream<Uint8Array>,
    contentType: request.headers.get("content-type") ?? "",
  };
}

async function makeValidMp4(): Promise<Buffer> {
  const outPath = path.join(tmpVideoDir, `${randomUUID()}.mp4`);
  await execFileAsync(config.FFMPEG_PATH, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:size=64x64:duration=1:rate=5",
    "-pix_fmt",
    "yuv420p",
    outPath,
  ]);
  return readFile(outPath);
}

beforeAll(async () => {
  tmpVideoDir = await mkdtemp(path.join(tmpdir(), "ca-upload-test-"));
  const user = await prisma.user.create({
    data: {
      email: `upload-${randomUUID()}@editortest.local`,
      displayName: "Upload Tester",
      firstName: "Upload",
      lastName: "Tester",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  uploaderId = user.id;
});

afterAll(async () => {
  const storage = getFileStorage();
  const attachments = await prisma.attachment.findMany({
    where: { id: { in: createdAttachmentIds } },
  });
  for (const attachment of attachments) {
    await storage.delete(attachment.storageKey).catch(() => {});
    if (attachment.thumbnailKey) {
      await storage.delete(attachment.thumbnailKey).catch(() => {});
    }
    if (
      attachment.posterKey &&
      attachment.posterKey !== attachment.thumbnailKey
    ) {
      await storage.delete(attachment.posterKey).catch(() => {});
    }
  }
  await prisma.attachment.deleteMany({
    where: { id: { in: createdAttachmentIds } },
  });
  await prisma.user.delete({ where: { id: uploaderId } }).catch(() => {});
  await rm(tmpVideoDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("runUploadPipeline — accepted files", () => {
  it("processes a valid JPEG: re-encodes, strips to a clean buffer, generates a thumbnail", async () => {
    const buffer = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 200, g: 10, b: 10 },
      },
    })
      .jpeg()
      .toBuffer();
    const { body, contentType } = toBody(buffer, "photo.jpg", "image/jpeg");

    const attachment = await runUploadPipeline({
      body,
      contentType,
      uploadedById: uploaderId,
    });
    createdAttachmentIds.push(attachment.id);

    expect(attachment.status).toBe("TEMPORARY");
    expect(attachment.kind).toBe("IMAGE");
    expect(attachment.width).toBe(40);
    expect(attachment.height).toBe(30);
    expect(attachment.thumbnailKey).not.toBeNull();
    expect(await getFileStorage().exists(attachment.storageKey)).toBe(true);
    if (!attachment.thumbnailKey) throw new Error("expected a thumbnailKey");
    expect(await getFileStorage().exists(attachment.thumbnailKey)).toBe(true);
  });

  it("processes a valid PNG", async () => {
    const buffer = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const { body, contentType } = toBody(buffer, "photo.png", "image/png");

    const attachment = await runUploadPipeline({
      body,
      contentType,
      uploadedById: uploaderId,
    });
    createdAttachmentIds.push(attachment.id);
    expect(attachment.kind).toBe("IMAGE");
    expect(attachment.mimeType).toBe("image/png");
  });

  it("processes a valid MP4: probes duration/codec/dimensions, extracts a poster frame", async () => {
    const buffer = await makeValidMp4();
    const { body, contentType } = toBody(buffer, "clip.mp4", "video/mp4");

    const attachment = await runUploadPipeline({
      body,
      contentType,
      uploadedById: uploaderId,
    });
    createdAttachmentIds.push(attachment.id);

    expect(attachment.kind).toBe("VIDEO");
    expect(attachment.width).toBe(64);
    expect(attachment.height).toBe(64);
    expect(attachment.videoCodec).toBeTruthy();
    expect(attachment.posterKey).not.toBeNull();
    expect(attachment.thumbnailKey).toBe(attachment.posterKey);
    if (!attachment.posterKey) throw new Error("expected a posterKey");
    expect(await getFileStorage().exists(attachment.posterKey)).toBe(true);
  });
});

describe("runUploadPipeline — crafted-file rejections (Phase 9 exit criterion)", () => {
  it("rejects SVG outright, regardless of validity", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const { body, contentType } = toBody(svg, "evil.svg", "image/svg+xml");

    await expect(
      runUploadPipeline({ body, contentType, uploadedById: uploaderId }),
    ).rejects.toMatchObject({
      code: "FILE_TYPE_REJECTED",
    } satisfies Partial<FileRejectedError>);
  });

  it("rejects an extension/MIME mismatch (real PNG bytes, declared as a .jpg)", async () => {
    const png = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();
    const { body, contentType } = toBody(png, "photo.jpg", "image/png");

    await expect(
      runUploadPipeline({ body, contentType, uploadedById: uploaderId }),
    ).rejects.toMatchObject({
      code: "FILE_TYPE_REJECTED",
    } satisfies Partial<FileRejectedError>);
  });

  it("rejects a magic-byte mismatch — plain text disguised as a .jpg", async () => {
    const text = Buffer.from("this is not an image, just text pretending");
    const { body, contentType } = toBody(text, "fake.jpg", "image/jpeg");

    await expect(
      runUploadPipeline({ body, contentType, uploadedById: uploaderId }),
    ).rejects.toMatchObject({
      code: "FILE_TYPE_REJECTED",
    } satisfies Partial<FileRejectedError>);
  });

  it("rejects a polyglot: valid MP4 header bytes but a truncated/corrupt stream", async () => {
    const validMp4 = await makeValidMp4();
    const truncated = validMp4.subarray(0, 256);
    const { body, contentType } = toBody(truncated, "clip.mp4", "video/mp4");

    await expect(
      runUploadPipeline({ body, contentType, uploadedById: uploaderId }),
    ).rejects.toMatchObject({
      code: "FILE_TYPE_REJECTED",
    } satisfies Partial<FileRejectedError>);
  });

  it("rejects an oversize image", async () => {
    // Random (incompressible) pixel data at compressionLevel 0 comfortably
    // exceeds MAX_IMAGE_SIZE once encoded — a real oversize file, not a
    // synthetic byte count.
    const side = 2200;
    const raw = Buffer.alloc(side * side * 3);
    for (let i = 0; i < raw.length; i++)
      raw[i] = Math.floor(Math.random() * 256);
    const buffer = await sharp(raw, {
      raw: { width: side, height: side, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(buffer.byteLength).toBeGreaterThan(config.MAX_IMAGE_SIZE);
    const { body, contentType } = toBody(buffer, "huge.png", "image/png");

    await expect(
      runUploadPipeline({ body, contentType, uploadedById: uploaderId }),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    } satisfies Partial<FileRejectedError>);
  });

  it("rejects a disallowed MIME type outright", async () => {
    const buffer = Buffer.from("MZ fake exe header");
    const { body, contentType } = toBody(
      buffer,
      "tool.exe",
      "application/x-msdownload",
    );

    await expect(
      runUploadPipeline({ body, contentType, uploadedById: uploaderId }),
    ).rejects.toMatchObject({
      code: "FILE_TYPE_REJECTED",
    } satisfies Partial<FileRejectedError>);
  });
});
