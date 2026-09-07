/**
 * Extension/MIME allowlists and format mappings for the upload pipeline —
 * ARCHITECTURE.md §6 steps 2-4. SVG is never allowed (CONFIGURATION.md):
 * it isn't in `ALLOWED_IMAGE_TYPES`, so it's rejected the same way any
 * other disallowed type is, with no special case needed.
 */
import { config } from "@/server/config";

export type AttachmentKind = "IMAGE" | "VIDEO";

/** Canonical extension + accepted alternates (e.g. a `.jpeg` upload declaring `image/jpeg`) per declared MIME type. */
const EXTENSIONS_BY_MIME: Record<
  string,
  { canonical: string; accepted: string[] }
> = {
  "image/jpeg": { canonical: ".jpg", accepted: [".jpg", ".jpeg"] },
  "image/png": { canonical: ".png", accepted: [".png"] },
  "image/webp": { canonical: ".webp", accepted: [".webp"] },
  "image/gif": { canonical: ".gif", accepted: [".gif"] },
  "video/mp4": { canonical: ".mp4", accepted: [".mp4"] },
  "video/webm": { canonical: ".webm", accepted: [".webm"] },
  "video/quicktime": { canonical: ".mov", accepted: [".mov", ".qt"] },
};

/** Sharp's output-format name for each accepted image MIME type. */
export const SHARP_FORMAT_BY_MIME: Record<
  string,
  "jpeg" | "png" | "webp" | "gif"
> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Step 2 (part 1) — is this declared MIME type on the configured allowlist at all, and what kind is it? */
export function kindForMime(mimeType: string): AttachmentKind | null {
  if ((config.ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return "IMAGE";
  }
  if ((config.ALLOWED_VIDEO_TYPES as readonly string[]).includes(mimeType)) {
    return "VIDEO";
  }
  return null;
}

/** The canonical extension a stored object for this MIME type gets (independent of what the uploader's filename used). */
export function canonicalExtension(mimeType: string): string | undefined {
  return EXTENSIONS_BY_MIME[mimeType]?.canonical;
}

/** Same as `canonicalExtension`, for call sites that already checked `kindForMime` — an undefined result there is an invariant violation, not a user-facing rejection. */
export function requireCanonicalExtension(mimeType: string): string {
  const extension = canonicalExtension(mimeType);
  if (!extension) {
    throw new Error(
      `No canonical extension registered for MIME type: ${mimeType}`,
    );
  }
  return extension;
}

/** Step 2 (part 2) — does the uploaded filename's extension agree with the declared MIME type? */
export function extensionMatchesMime(
  filenameExtension: string,
  mimeType: string,
): boolean {
  const entry = EXTENSIONS_BY_MIME[mimeType];
  if (!entry) return false;
  return entry.accepted.includes(filenameExtension.toLowerCase());
}

/** Strips any path component and unsafe characters — display-only, never used to address the filesystem. */
export function sanitizeFilename(originalFilename: string): string {
  const base = originalFilename.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "file";
}
