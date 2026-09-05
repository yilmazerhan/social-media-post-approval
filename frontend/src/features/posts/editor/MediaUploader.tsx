import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';
import { attachmentsApi } from '@shared/api/client';
import { ApiError } from '@shared/api/http';
import { probeMedia, uploadBytes } from '@shared/api/upload';
import type { Attachment } from '@shared/api/types';
import { MediaCard, PendingMediaCard, type PendingUpload } from '@features/posts/editor/MediaCard';

const ACCEPTED =
  'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf';

/**
 * The media workspace.
 *
 * <p>Uploads run beside the editor rather than in front of it: a 500 MB video should never stop
 * someone from writing the next paragraph. Each file goes through the three-step flow the API
 * defines — ask for a target, send the bytes, confirm — and reports its own progress and its own
 * failure without taking the others down with it.
 */
export function MediaUploader({
  postId,
  attachments,
  editable,
  onChanged,
  onPreview,
}: {
  postId: string;
  attachments: Attachment[];
  editable: boolean;
  onChanged: () => void;
  onPreview: (attachment: Attachment) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);

  const updatePending = (clientId: string, patch: Partial<PendingUpload>) =>
    setPending((current) =>
      current.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)),
    );

  const uploadOne = useCallback(
    async (file: File) => {
      const clientId = `${file.name}-${file.size}-${Date.now()}`;
      setPending((current) => [
        ...current,
        { clientId, filename: file.name, contentType: file.type, sizeBytes: file.size, percent: 0 },
      ]);

      try {
        const probe = await probeMedia(file);
        const presigned = await attachmentsApi.presign(postId, {
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        });

        await uploadBytes(
          presigned.upload.uploadUrl,
          presigned.upload.method,
          file,
          presigned.upload.requiredHeaders,
          (percent) => updatePending(clientId, { percent }),
        );

        await attachmentsApi.complete(presigned.attachment.id, probe.durationSeconds);
        setPending((current) => current.filter((item) => item.clientId !== clientId));
        onChanged();
        queryClient.invalidateQueries({ queryKey: ['post', postId] });
      } catch (error) {
        const message =
          error instanceof ApiError
            ? (error.problem.detail ?? 'Upload failed. Try again.')
            : 'Upload failed. Try again.';
        updatePending(clientId, { error: message });
      }
    },
    [onChanged, postId, queryClient],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => void uploadOne(file));
  };

  const isEmpty = attachments.length === 0 && pending.length === 0;

  return (
    <Stack spacing={2}>
      {editable && (
        <Paper
          variant="outlined"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          sx={{
            p: isEmpty ? 5 : 3,
            textAlign: 'center',
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: dragging ? 'primary.main' : 'divider',
            bgcolor: dragging ? 'action.hover' : 'transparent',
            transition: 'background-color 120ms, border-color 120ms',
          }}
        >
          <Stack sx={{ alignItems: 'center' }} spacing={1.5}>
            <Box sx={{ color: 'text.disabled', '& svg': { fontSize: isEmpty ? 44 : 32 } }}>
              {isEmpty ? <PermMediaOutlinedIcon /> : <CloudUploadOutlinedIcon />}
            </Box>
            <Stack spacing={0.5}>
              <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
                {isEmpty ? 'Add images or videos' : 'Add more media'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Drag and drop files here or browse your device.
              </Typography>
            </Stack>
            <Button
              variant="outlined"
              onClick={() => inputRef.current?.click()}
              startIcon={<CloudUploadOutlinedIcon />}
            >
              Upload media
            </Button>
            <Typography variant="caption" color="text.disabled">
              JPEG, PNG, GIF, WebP up to 25 MB · MP4, MOV, WebM up to 500 MB
            </Typography>
          </Stack>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPTED}
            aria-label="Choose media files"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </Paper>
      )}

      {pending.map((upload) => (
        <PendingMediaCard
          key={upload.clientId}
          upload={upload}
          onCancel={() =>
            setPending((current) => current.filter((item) => item.clientId !== upload.clientId))
          }
        />
      ))}

      {attachments.map((attachment) => (
        <MediaCard
          key={attachment.id}
          attachment={attachment}
          editable={editable}
          onPreview={() => onPreview(attachment)}
          onRemove={async () => {
            await attachmentsApi.remove(attachment.id);
            onChanged();
          }}
          onDescribe={async (values) => {
            await attachmentsApi.describe(attachment.id, values);
            onChanged();
          }}
        />
      ))}

      {!editable && attachments.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No media attached.
        </Typography>
      )}
    </Stack>
  );
}
