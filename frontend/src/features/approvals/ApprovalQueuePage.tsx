import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { approvalsApi } from '@shared/api/client';
import { PriorityBadge } from '@shared/components/PriorityBadge';
import { AiRiskBadge } from '@shared/components/AiRiskBadge';
import { SlaIndicator } from '@shared/components/SlaIndicator';
import { VersionBadge } from '@shared/components/VersionBadge';
import { UserChip } from '@shared/components/UserChip';
import { EmptyState } from '@shared/components/EmptyState';

/** The approver's queue, ordered by what is closest to breaching its deadline. */
export function ApprovalQueuePage() {
  const navigate = useNavigate();
  const approvals = useQuery({ queryKey: ['approvals'], queryFn: () => approvalsApi.queue(true) });

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700 }} variant="h5" component="h1">
          Approvals
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Waiting on you, most urgent first.
        </Typography>
      </Stack>

      {approvals.isPending ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : (approvals.data ?? []).length === 0 ? (
        <EmptyState
          icon={<InboxOutlinedIcon />}
          title="Nothing waiting for you"
          description="When a colleague submits a post for your approval it will appear here."
        />
      ) : (
        <Stack spacing={1.5}>
          {(approvals.data ?? []).map((item) => (
            <Card key={item.approvalId} variant="outlined">
              <CardActionArea onClick={() => navigate(`/approvals/${item.approvalId}/review`)}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack
                      sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
                      direction="row"
                      spacing={1}
                      useFlexGap
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1, minWidth: 0 }}>
                        {item.postTitle}
                      </Typography>
                      <PriorityBadge priority={item.priority} />
                      <VersionBadge versionNo={item.versionNo} awaitingApproval />
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      {item.excerpt}
                    </Typography>

                    <Stack
                      sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                    >
                      <UserChip user={item.author} size="small" />
                      <Stack
                        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                        direction="row"
                        spacing={1}
                        useFlexGap
                      >
                        <AiRiskBadge level={item.aiRiskLevel} status={item.aiStatus} />
                        <SlaIndicator
                          secondsRemaining={item.secondsRemaining}
                          dueAt={item.dueAt}
                          state={item.slaState}
                          variant="compact"
                        />
                      </Stack>
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
