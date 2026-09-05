import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { commentsApi } from '@shared/api/client';
import type { Comment } from '@shared/api/types';
import { UserChip } from '@shared/components/UserChip';
import { formatRelative } from '@shared/lib/format';

/**
 * The review discussion, kept next to the decision rather than on another screen.
 *
 * <p>Comments are plain text. A thread attached to content under governance is not a place for
 * markup, and keeping it plain removes a whole class of problems at the source.
 */
export function CommentThread({
  postId,
  comments,
  canComment,
}: {
  postId: string;
  comments: Comment[];
  canComment: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const add = useMutation({
    mutationFn: () => commentsApi.add(postId, { body: draft }),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['approval'] });
    },
  });

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack spacing={2}>
        <Typography sx={{ fontWeight: 700 }} variant="subtitle1">
          Review discussion
        </Typography>

        {comments.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No comments yet. Anything you write here is visible to the author.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {comments.map((comment) => (
              <CommentRow key={comment.id} comment={comment} />
            ))}
          </Stack>
        )}

        {canComment && (
          <Stack spacing={1}>
            <TextField
              multiline
              minRows={2}
              placeholder="Add a review comment…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              slotProps={{ htmlInput: { 'aria-label': 'Add a review comment' } }}
            />
            {add.isError && <Alert severity="error">Your comment could not be posted. Try again.</Alert>}
            <Box>
              <Button
                variant="outlined"
                size="small"
                onClick={() => add.mutate()}
                disabled={!draft.trim() || add.isPending}
              >
                {add.isPending ? 'Posting…' : 'Post comment'}
              </Button>
            </Box>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function CommentRow({ comment }: { comment: Comment }) {
  return (
    <Stack spacing={0.75}>
      <Stack sx={{ alignItems: 'center', justifyContent: 'space-between' }} direction="row" spacing={1}>
        <UserChip user={comment.author} size="small" />
        <Stack sx={{ alignItems: 'center' }} direction="row" spacing={1}>
          {comment.internal && <Chip size="small" variant="outlined" label="Approvers only" />}
          <Typography variant="caption" color="text.secondary">
            {formatRelative(comment.createdAt)}
          </Typography>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          {comment.body}
        </Typography>
      </Paper>
      {comment.replies.length > 0 && (
        <Stack spacing={1.5} sx={{ pl: 3, borderLeft: 2, borderColor: 'divider' }}>
          {comment.replies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
