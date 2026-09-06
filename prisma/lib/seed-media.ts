/**
 * Generates the physical files `prisma/seed.ts`'s hero-post `Attachment`
 * rows reference. The rows existed since Phase 9's fixture; nothing ever
 * wrote the files themselves, so a fresh environment 500s on the video
 * thumbnail (flagged in Phases 26-28's retrospectives). Synthetic and
 * safe to regenerate — this is seed fixture data, never real uploaded
 * content — and idempotent per file, so a repeat seed run (or a fresh
 * clone whose `data/uploads` was wiped but not its database) never
 * re-encodes what's already on disk.
 */
import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { config } from "@/server/config";

const execFileAsync = promisify(execFile);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureHeroAttachmentFiles(postId: string) {
  const dir = path.join(config.STORAGE_PATH, "seed", postId);
  await mkdir(dir, { recursive: true });

  const heroImage = path.join(dir, "hero-image.png");
  const heroImageThumb = path.join(dir, "hero-image-thumb.png");
  const heroVideo = path.join(dir, "hero-video.mp4");
  const heroVideoPoster = path.join(dir, "hero-video-poster.png");
  const heroVideoThumb = path.join(dir, "hero-video-thumb.png");

  if (!(await fileExists(heroImage))) {
    await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 3,
        background: { r: 30, g: 64, b: 175 },
      },
    })
      .png()
      .toFile(heroImage);
  }
  if (!(await fileExists(heroImageThumb))) {
    // Same resize convention as the real pipeline (media.ts's processImage).
    await sharp(heroImage)
      .resize({ width: config.THUMBNAIL_WIDTH, withoutEnlargement: true })
      .png()
      .toFile(heroImageThumb);
  }

  if (!(await fileExists(heroVideo))) {
    // Same synthetic-source technique as tests/integration/attachments-pipeline.test.ts's makeValidMp4.
    await execFileAsync(config.FFMPEG_PATH, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x1e40af:size=1280x720:duration=45:rate=5",
      "-pix_fmt",
      "yuv420p",
      heroVideo,
    ]);
  }
  if (!(await fileExists(heroVideoPoster))) {
    // Same frame-extraction convention as media.ts's extractPosterFrame.
    await execFileAsync(config.FFMPEG_PATH, [
      "-y",
      "-i",
      heroVideo,
      "-vf",
      "thumbnail",
      "-frames:v",
      "1",
      heroVideoPoster,
    ]);
  }
  if (!(await fileExists(heroVideoThumb))) {
    await execFileAsync(config.FFMPEG_PATH, [
      "-y",
      "-i",
      heroVideo,
      "-vf",
      `thumbnail,scale=${config.THUMBNAIL_WIDTH}:-1`,
      "-frames:v",
      "1",
      heroVideoThumb,
    ]);
  }
}
