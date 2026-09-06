"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileVideo,
  Image as ImageIcon,
  Upload,
  X,
} from "lucide-react";
import type { AttachmentDto } from "@/modules/attachments";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  deleteJson,
  uploadFile,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface PendingUpload {
  key: string;
  filename: string;
  progress: number;
  error: string | null;
}

export interface MediaUploaderProps {
  attachments: AttachmentDto[];
  onChange: (next: AttachmentDto[]) => void;
  maxAttachments: number;
  maxUploadSize: number;
  allowedTypes: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A courtesy pre-check only — the server decides, per UI_UX_SPEC.md §4. */
function precheckFile(
  file: File,
  maxUploadSize: number,
  allowedTypes: string[],
): string | null {
  if (file.type === "image/svg+xml") return "SVG files are not accepted.";
  if (!allowedTypes.includes(file.type))
    return "This file type is not accepted.";
  if (file.size > maxUploadSize) return "File exceeds the maximum upload size.";
  return null;
}

export function MediaUploader({
  attachments,
  onChange,
  maxAttachments,
  maxUploadSize,
  allowedTypes,
}: MediaUploaderProps) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const remainingSlots = Math.max(
    0,
    maxAttachments - attachments.length - pending.length,
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).slice(0, remainingSlots);
      for (const file of list) {
        const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
        const precheckError = precheckFile(file, maxUploadSize, allowedTypes);
        setPending((prev) => [
          ...prev,
          { key, filename: file.name, progress: 0, error: precheckError },
        ]);
        if (precheckError) continue;

        const handle = uploadFile<AttachmentDto>("/api/v1/attachments", file, {
          csrfCookieName: CSRF_COOKIE_NAME,
          onProgress: (fraction) => {
            setPending((prev) =>
              prev.map((p) =>
                p.key === key ? { ...p, progress: fraction } : p,
              ),
            );
          },
        });
        handle.promise
          .then((attachment) => {
            setPending((prev) => prev.filter((p) => p.key !== key));
            onChange([...attachmentsRef.current, attachment]);
          })
          .catch((err) => {
            const message =
              err instanceof ApiError ? err.message : "Upload failed.";
            setPending((prev) =>
              prev.map((p) => (p.key === key ? { ...p, error: message } : p)),
            );
          });
      }
    },
    [allowedTypes, maxUploadSize, onChange, remainingSlots],
  );

  function dismissPending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
  }

  function handleRemove(id: string) {
    onChange(attachments.filter((a) => a.id !== id));
    // Best-effort: only actually deletes while still unattached; once bound
    // to a version it stays (RESTRICT) and this just no-ops server-side.
    void deleteJson(`/api/v1/attachments/${id}`, {
      csrfCookieName: CSRF_COOKIE_NAME,
    }).catch(() => {});
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= attachments.length) return;
    const next = [...attachments];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium">Media</h3>
      <div className="mt-2 flex flex-wrap gap-3">
        {attachments.map((attachment, index) => (
          <div
            key={attachment.id}
            className="group bg-muted relative size-20 overflow-hidden rounded-md border"
          >
            {attachment.hasThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated, non-static endpoint; next/image can't proxy it.
              <img
                src={`/api/v1/attachments/${attachment.id}/thumbnail`}
                alt={attachment.originalFilename}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                {attachment.kind === "VIDEO" ? (
                  <FileVideo aria-hidden className="size-6" />
                ) : (
                  <ImageIcon aria-hidden className="size-6" />
                )}
              </div>
            )}
            <span className="bg-background/80 absolute top-0.5 left-0.5 rounded px-1 text-[10px] font-medium">
              {attachment.kind === "VIDEO" ? "VID" : "IMG"}
            </span>
            <div className="absolute inset-x-0 bottom-0 hidden justify-center gap-0.5 bg-black/50 p-0.5 group-focus-within:flex group-hover:flex">
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${attachment.originalFilename} earlier`}
                className="text-white disabled:opacity-30"
              >
                <ChevronUp aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={index === attachments.length - 1}
                aria-label={`Move ${attachment.originalFilename} later`}
                className="text-white disabled:opacity-30"
              >
                <ChevronDown aria-hidden className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => handleRemove(attachment.id)}
                aria-label={`Remove ${attachment.originalFilename}`}
                className="text-white"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        ))}

        {pending.map((item) => (
          <div
            key={item.key}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border p-1 text-center"
          >
            {item.error ? (
              <>
                <span className="text-destructive text-[10px]">
                  {item.error}
                </span>
                <button
                  type="button"
                  onClick={() => dismissPending(item.key)}
                  className="text-muted-foreground text-[10px] underline"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <span className="w-full truncate text-[10px]">
                  {item.filename}
                </span>
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-all"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              </>
            )}
          </div>
        ))}

        {remainingSlots > 0 && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length > 0)
                handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "text-muted-foreground flex h-20 min-w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 text-xs",
              dragOver && "border-primary bg-primary/5",
            )}
          >
            <Upload aria-hidden className="size-4" />
            <span>Drag &amp; drop or browse</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={allowedTypes.join(",")}
        className="sr-only"
        aria-label="Choose files to upload"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
          }
          e.target.value = "";
        }}
      />
      <p className="text-muted-foreground mt-1 text-xs">
        {formatBytes(maxUploadSize)} max per file · up to {maxAttachments}{" "}
        attachments
      </p>
    </div>
  );
}
