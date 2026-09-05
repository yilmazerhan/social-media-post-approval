import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { postsApi } from '@shared/api/client';
import { StatusBadge } from '@shared/components/StatusBadge';
import { PriorityBadge } from '@shared/components/PriorityBadge';
import { EmptyState } from '@shared/components/EmptyState';
import { formatRelative } from '@shared/lib/format';

const FILTERS = [
  { label: 'All', status: undefined },
  { label: 'Drafts', status: 'DRAFT' },
  { label: 'In review', status: 'IN_REVIEW' },
  { label: 'Changes requested', status: 'CHANGES_REQUESTED' },
  { label: 'Approved', status: 'APPROVED' },
] as const;

/** The author's home: what they have written and where each piece stands. */
export function MyPostsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState(0);

  const status = FILTERS[filter]?.status;
  const posts = useQuery({
    queryKey: ['posts', status ?? 'all'],
    queryFn: () => postsApi.list({ status, mine: true }),
  });

  const create = useMutation({
    mutationFn: () => postsApi.create(''),
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate(`/posts/${post.id}/edit`);
    },
  });

  const items = useMemo(() => posts.data ?? [], [posts.data]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontWeight: 700 }} variant="h5" component="h1">
          My posts
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          New post
        </Button>
      </Stack>

      <Tabs value={filter} onChange={(_, value) => setFilter(value)} sx={{ mb: 2 }} variant="scrollable">
        {FILTERS.map((item) => (
          <Tab key={item.label} label={item.label} />
        ))}
      </Tabs>

      {posts.isPending ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ArticleOutlinedIcon />}
          title="Nothing here yet"
          description="Create a post to start the approval process."
          action={
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => create.mutate()}>
              New post
            </Button>
          }
        />
      ) : (
        <Stack spacing={1.5}>
          {items.map((post) => (
            <Card key={post.id} variant="outlined">
              <CardActionArea onClick={() => navigate(`/posts/${post.id}/edit`)}>
                <CardContent>
                  <Stack spacing={1}>
                    <Stack
                      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                      direction="row"
                      spacing={1}
                      useFlexGap
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }}
                        noWrap
                      >
                        {post.title}
                      </Typography>
                      <StatusBadge status={post.status} />
                      <PriorityBadge priority={post.priority} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden' }}>
                      {post.excerpt || 'No content yet.'}
                    </Typography>
                    <Stack sx={{ flexWrap: 'wrap' }} direction="row" spacing={2} useFlexGap>
                      <Typography variant="caption" color="text.secondary">
                        Updated {formatRelative(post.updatedAt)}
                      </Typography>
                      {post.versionNo > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Version {post.versionNo}
                        </Typography>
                      )}
                      {post.attachmentCount > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {post.attachmentCount} attachment{post.attachmentCount === 1 ? '' : 's'}
                        </Typography>
                      )}
                      {post.channel && (
                        <Typography variant="caption" color="text.secondary">
                          {post.channel.name}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      <Box sx={{ height: 32 }} />
    </Container>
  );
}
