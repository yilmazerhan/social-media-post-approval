import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { aiApi, postsApi, referenceApi } from '@shared/api/client';
import { ApiError } from '@shared/api/http';
import type { AiFinding, Attachment, Priority, SubmitResult, UserSummary } from '@shared/api/types';
import { StatusBadge } from '@shared/components/StatusBadge';
import { VersionBadge } from '@shared/components/VersionBadge';
import { formatRelative, plainTextLength } from '@shared/lib/format';
import { RichTextEditor } from '@features/posts/editor/RichTextEditor';
import { MediaUploader } from '@features/posts/editor/MediaUploader';
import { PublicationPreview } from '@features/posts/editor/PublicationPreview';
import { PostSettingsPanel } from '@features/posts/editor/PostSettingsPanel';
import { AiContentCheckPanel } from '@features/posts/editor/AiContentCheckPanel';
import { PreSubmissionDialog, type SubmissionCheck } from '@features/posts/editor/PreSubmissionDialog';
import { SubmissionConfirmation } from '@features/posts/editor/SubmissionConfirmation';
import { ChangesRequestedBanner } from '@features/posts/editor/ChangesRequestedBanner';

const AUTOSAVE_DELAY_MS = 1200;

/**
 * The authoring workspace.
 *
 * <p>Three columns on a wide screen — write, see, govern — because those are the three questions an
 * author has at once, and making them switch tabs to answer any of them is what makes content tools
 * tiring. On a narrow screen the same three become tabs rather than a scroll.
 */
export function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up('lg'));
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));

  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [selectedApprovers, setSelectedApprovers] = useState<UserSummary[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const hydrated = useRef(false);

  const post = useQuery({
    queryKey: ['post', id],
    queryFn: () => postsApi.get(id as string),
    enabled: Boolean(id),
  });
  const channels = useQuery({ queryKey: ['channels'], queryFn: referenceApi.channels });
  const approvers = useQuery({ queryKey: ['approvers'], queryFn: referenceApi.approvers });
  const aiReview = useQuery({
    queryKey: ['ai-review', id],
    queryFn: () => aiApi.latest(id as string),
    enabled: Boolean(id),
  });
  const timeline = useQuery({
    queryKey: ['timeline', id],
    queryFn: () => postsApi.timeline(id as string),
    enabled: Boolean(id),
  });

  // Local state is seeded once; after that the editor owns it, so autosave never fights the user.
  useEffect(() => {
    if (post.data && !hydrated.current) {
      setTitle(post.data.title === 'Untitled post' ? '' : post.data.title);
      setBodyHtml(post.data.bodyHtml);
      setPriority(post.data.priority);
      setChannelId(post.data.channel?.id ?? null);
      hydrated.current = true;
    }
  }, [post.data]);

  const save = useMutation({
    mutationFn: (values: { title: string; bodyHtml: string; priority: Priority; channelId: string | null }) =>
      postsApi.update(id as string, {
        title: values.title || 'Untitled post',
        bodyHtml: values.bodyHtml,
        priority: values.priority,
        channelId: values.channelId,
        concurrencyToken: post.data?.concurrencyToken,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['post', id], updated);
      setSavedAt(new Date());
      setSaveError(null);
    },
    onError: (error) => {
      setSaveError(
        error instanceof ApiError
          ? (error.problem.detail ?? 'Could not save your changes.')
          : 'Could not save your changes.',
      );
    },
  });

  const editable = post.data?.editable ?? false;

  // Autosave: quiet, debounced, and never while the post is locked for review.
  useEffect(() => {
    if (!hydrated.current || !editable || !id) return;
    const handle = window.setTimeout(() => {
      save.mutate({ title, bodyHtml, priority, channelId });
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyHtml, priority, channelId, editable, id]);

  const runAiCheck = useMutation({
    mutationFn: () => aiApi.run(id as string),
    onSuccess: (review) => queryClient.setQueryData(['ai-review', id], review),
  });

  const submit = useMutation({
    mutationFn: () =>
      postsApi.submit(id as string, { approverIds: selectedApprovers.map((approver) => approver.id) }),
    onSuccess: (result) => {
      setSubmissionOpen(false);
      setSubmitResult(result);
      queryClient.invalidateQueries({ queryKey: ['post', id] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  const applySuggestion = useCallback((finding: AiFinding) => {
    if (!finding.suggestion) return;
    // Appended as a clearly marked block rather than silently replacing the author's words: an
    // AI suggestion must stay distinguishable from what a person wrote.
    setBodyHtml(
      (current) =>
        `${current}<p><em>Suggested wording (AI-assisted, review before keeping):</em> ${finding.suggestion}</p>`,
    );
  }, []);

  const characters = useMemo(() => plainTextLength(bodyHtml), [bodyHtml]);
  const channel = channels.data?.find((item) => item.id === channelId) ?? post.data?.channel ?? null;
  const limit = channel?.maxCharacters ?? null;
  const recommended = channel?.recommendedCharacters ?? null;

  const lastChangeRequest = useMemo(
    () =>
      [...(timeline.data ?? [])]
        .reverse()
        .find((entry) => entry.action === 'REQUEST_CHANGES' || entry.action === 'REJECT'),
    [timeline.data],
  );

  const checks = useMemo<SubmissionCheck[]>(() => {
    const attachments = post.data?.attachments ?? [];
    const notReady = attachments.filter((attachment) => attachment.status !== 'READY');
    const missingAlt = attachments.filter(
      (attachment) => attachment.kind === 'IMAGE' && !attachment.altText?.trim(),
    );
    return [
      {
        id: 'content',
        label: 'Content added',
        detail: title.trim() && characters > 0 ? undefined : 'A title and some content are required.',
        state: title.trim() && characters > 0 ? 'PASSED' : 'BLOCKED',
      },
      {
        id: 'media',
        label: attachments.length > 0 ? 'Media validated' : 'No media attached',
        detail:
          notReady.length > 0
            ? `${notReady.length} file(s) still processing or rejected.`
            : missingAlt.length > 0
              ? `${missingAlt.length} image(s) still need a description.`
              : undefined,
        state: notReady.length > 0 || missingAlt.length > 0 ? 'BLOCKED' : 'PASSED',
      },
      {
        id: 'route',
        label: 'Approval route assigned',
        detail:
          selectedApprovers.length > 0
            ? selectedApprovers.map((approver) => approver.displayName).join(', ')
            : 'Assigned automatically to the approver group.',
        state: 'PASSED',
      },
      {
        id: 'ai',
        label: 'AI content check completed',
        detail:
          aiReview.data?.status === 'COMPLETED'
            ? `${aiReview.data.findings.filter((finding) => finding.severity !== 'INFO').length} item(s) flagged.`
            : 'Optional in this environment — you can submit without it.',
        state: aiReview.data?.status === 'COMPLETED' ? 'PASSED' : 'PENDING',
      },
    ];
  }, [aiReview.data, characters, post.data?.attachments, selectedApprovers, title]);

  if (submitResult) {
    return <SubmissionConfirmation result={submitResult} />;
  }

  if (post.isPending) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <CircularProgress aria-label="Loading post" />
      </Box>
    );
  }

  if (post.isError || !post.data) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="error">
          <AlertTitle>This post could not be loaded</AlertTitle>
          It may have been deleted, or you may not have access to it.
          <Box sx={{ mt: 2 }}>
            <Button onClick={() => navigate('/posts')}>Back to my posts</Button>
          </Box>
        </Alert>
      </Container>
    );
  }

  const detail = post.data;

  const contentColumn = (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography sx={{ fontWeight: 700 }} variant="h6">
          Create your post
        </Typography>
        <TextField
          label="Title"
          placeholder="Enter a title…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!editable}
          fullWidth
          size="medium"
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
      </Stack>

      <Stack spacing={1}>
        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} disabled={!editable} />
        <CharacterCount
          count={characters}
          limit={limit}
          recommended={recommended}
          channelName={channel?.name}
        />
      </Stack>

      <Divider />

      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
          Media
        </Typography>
        <MediaUploader
          postId={detail.id}
          attachments={detail.attachments}
          editable={editable}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['post', id] })}
          onPreview={setPreviewAttachment}
        />
      </Stack>
    </Stack>
  );

  const previewColumn = (
    <PublicationPreview
      title={title}
      bodyHtml={bodyHtml}
      attachments={detail.attachments}
      channel={channel}
      author={detail.author}
    />
  );

  const settingsColumn = (
    <Stack spacing={3}>
      <PostSettingsPanel
        priority={priority}
        channelId={channelId}
        channels={channels.data ?? []}
        approvers={approvers.data ?? []}
        selectedApprovers={selectedApprovers}
        disabled={!editable}
        onPriorityChange={setPriority}
        onChannelChange={setChannelId}
        onApproversChange={setSelectedApprovers}
      />
      <Divider />
      <AiContentCheckPanel
        review={aiReview.data}
        running={runAiCheck.isPending}
        onRun={() => runAiCheck.mutate()}
        onApplySuggestion={editable ? applySuggestion : undefined}
        compact
      />
    </Stack>
  );

  return (
    <>
      <Box
        sx={{
          position: 'sticky',
          top: 64,
          zIndex: 2,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="xl" sx={{ py: 1.5 }}>
          <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={2} useFlexGap>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/posts')} color="inherit">
              Back to my posts
            </Button>

            <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack sx={{ alignItems: 'center', flexWrap: 'wrap' }} direction="row" spacing={1} useFlexGap>
                <Typography sx={{ fontWeight: 700 }} variant="subtitle1" noWrap>
                  {detail.versionNo > 0 ? 'Edit post' : 'Create post'}
                </Typography>
                <StatusBadge status={detail.status} />
                {detail.versionNo > 0 && (
                  <VersionBadge
                    versionNo={detail.status === 'IN_REVIEW' ? detail.versionNo : detail.versionNo + 1}
                    awaitingApproval={detail.status === 'IN_REVIEW'}
                  />
                )}
              </Stack>
              <SaveIndicator
                saving={save.isPending}
                savedAt={savedAt}
                error={saveError}
                editable={editable}
              />
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<SaveOutlinedIcon />}
                onClick={() => save.mutate({ title, bodyHtml, priority, channelId })}
                disabled={!editable || save.isPending}
              >
                Save draft
              </Button>
              {isCompact && (
                <Button onClick={() => setTab(1)} disabled={tab === 1}>
                  Preview
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<SendOutlinedIcon />}
                onClick={() => setSubmissionOpen(true)}
                disabled={!detail.submittable}
              >
                Submit for approval
              </Button>
            </Stack>
          </Stack>
        </Container>
        {save.isPending && <LinearProgress sx={{ height: 2 }} />}
      </Box>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Stack spacing={2.5}>
          {lastChangeRequest && detail.status === 'CHANGES_REQUESTED' && (
            <ChangesRequestedBanner entry={lastChangeRequest} nextVersionNo={detail.versionNo + 1} />
          )}

          {detail.status === 'IN_REVIEW' && (
            <Alert severity="info">
              <AlertTitle>This post is being reviewed</AlertTitle>
              Version {detail.versionNo} is with its reviewer and cannot be edited. Withdraw it first if you
              need to make a change.
              <Box sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    await postsApi.withdraw(detail.id);
                    queryClient.invalidateQueries({ queryKey: ['post', id] });
                  }}
                >
                  Withdraw from review
                </Button>
              </Box>
            </Alert>
          )}

          {saveError && <Alert severity="error">{saveError}</Alert>}

          {isCompact ? (
            <Paper variant="outlined">
              <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth">
                <Tab label="Editor" />
                <Tab label="Preview" />
                <Tab label="Settings" />
              </Tabs>
              <Box sx={{ p: 2 }}>
                {tab === 0 && contentColumn}
                {tab === 1 && previewColumn}
                {tab === 2 && settingsColumn}
              </Box>
            </Paper>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                alignItems: 'start',
                gridTemplateColumns: isWide
                  ? 'minmax(0, 1.1fr) minmax(0, 1fr) 320px'
                  : 'minmax(0, 1fr) 320px',
              }}
            >
              <Paper variant="outlined" sx={{ p: 3 }}>
                {contentColumn}
              </Paper>
              {isWide ? (
                <Paper variant="outlined" sx={{ p: 3, position: 'sticky', top: 150 }}>
                  {previewColumn}
                </Paper>
              ) : null}
              <Paper variant="outlined" sx={{ p: 3, position: 'sticky', top: 150 }}>
                <Stack spacing={3}>
                  {!isWide && (
                    <>
                      {previewColumn}
                      <Divider />
                    </>
                  )}
                  {settingsColumn}
                </Stack>
              </Paper>
            </Box>
          )}
        </Stack>
      </Container>

      <PreSubmissionDialog
        open={submissionOpen}
        checks={checks}
        approverSummary={
          selectedApprovers.length > 0
            ? `This will go to ${selectedApprovers.map((approver) => approver.displayName).join(', ')}.`
            : 'This will go to the approver group for your organisation.'
        }
        submitting={submit.isPending}
        onCancel={() => setSubmissionOpen(false)}
        onSubmit={() => submit.mutate()}
      />

      {submit.isError && (
        <Alert severity="error" sx={{ position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 1400 }}>
          {submit.error instanceof ApiError
            ? (submit.error.problem.detail ?? 'The post could not be submitted.')
            : 'The post could not be submitted.'}
        </Alert>
      )}

      <Dialog
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0, bgcolor: 'common.black' }}>
          {previewAttachment?.kind === 'VIDEO' ? (
            <Box
              component="video"
              controls
              autoPlay
              src={previewAttachment.contentUrl}
              sx={{ width: '100%', display: 'block' }}
            />
          ) : previewAttachment ? (
            <Box
              component="img"
              src={previewAttachment.contentUrl}
              alt={previewAttachment.altText ?? previewAttachment.filename}
              sx={{ width: '100%', display: 'block' }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Saved just now" — quiet, but always answerable at a glance. */
function SaveIndicator({
  saving,
  savedAt,
  error,
  editable,
}: {
  saving: boolean;
  savedAt: Date | null;
  error: string | null;
  editable: boolean;
}) {
  if (!editable) {
    return (
      <Typography variant="caption" color="text.secondary">
        Read-only
      </Typography>
    );
  }
  if (error) {
    return (
      <Typography variant="caption" color="error.main">
        Not saved — {error}
      </Typography>
    );
  }
  return (
    <Typography variant="caption" color="text.secondary">
      {saving ? 'Saving…' : savedAt ? `Saved ${formatRelative(savedAt.toISOString())}` : 'Autosave is on'}
    </Typography>
  );
}

function CharacterCount({
  count,
  limit,
  recommended,
  channelName,
}: {
  count: number;
  limit: number | null;
  recommended: number | null;
  channelName?: string | undefined;
}) {
  const nearLimit = limit !== null && count > limit * 0.9;
  const overLimit = limit !== null && count > limit;
  const overRecommended = recommended !== null && count > recommended;

  return (
    <Stack
      sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
      direction="row"
      spacing={1}
      useFlexGap
    >
      <Typography
        sx={{ fontWeight: nearLimit ? 600 : 400 }}
        variant="caption"
        color={overLimit ? 'error.main' : nearLimit ? 'warning.main' : 'text.secondary'}
      >
        {count.toLocaleString()} character{count === 1 ? '' : 's'}
        {limit !== null && ` of ${limit.toLocaleString()}`}
      </Typography>
      {overLimit ? (
        <Typography variant="caption" color="error.main">
          Over the limit for {channelName}. Shorten it before submitting.
        </Typography>
      ) : overRecommended ? (
        <Typography variant="caption" color="warning.main">
          Longer than the {recommended?.toLocaleString()} characters recommended for {channelName}.
        </Typography>
      ) : null}
    </Stack>
  );
}
