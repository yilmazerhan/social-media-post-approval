"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { ApprovalReviewDto } from "@/modules/approvals";
import {
  getJson,
  postJson,
  CSRF_COOKIE_NAME,
  ApiError,
} from "@/lib/api-client";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { PriorityBadge } from "@/components/app/priority-badge";
import { SLAIndicator } from "@/components/app/sla-indicator";
import { EmptyState } from "@/components/app/empty-state";
import { ACTION_LABELS } from "@/components/app/activity-item";
import { VersionDiff } from "@/components/app/post-details/version-diff";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { FileText, MessageSquare } from "lucide-react";

type DecisionAction = "APPROVE" | "REQUEST_CHANGES" | "REJECT";

interface DecisionResult {
  action: DecisionAction;
  version: number;
  at: string;
}

const CONCURRENCY_POLL_MS = 15_000;

const DECISION_ENDPOINT: Record<DecisionAction, string> = {
  APPROVE: "approve",
  REQUEST_CHANGES: "request-changes",
  REJECT: "reject",
};

const DECISION_VERB: Record<DecisionAction, string> = {
  APPROVE: "Approve",
  REQUEST_CHANGES: "Request changes on",
  REJECT: "Reject",
};

const DECISION_RESULT_LABEL: Record<DecisionAction, string> = {
  APPROVE: "APPROVED",
  REQUEST_CHANGES: "CHANGES REQUESTED",
  REJECT: "REJECTED",
};

function formatDateTime(value: string | null): string {
  return value ? format(new Date(value), "d MMM yyyy HH:mm") : "—";
}

function DecisionPanelContent({
  payload,
  comment,
  onCommentChange,
  onDecide,
  disabled,
}: {
  payload: ApprovalReviewDto;
  comment: string;
  onCommentChange: (value: string) => void;
  onDecide: (action: DecisionAction) => void;
  disabled: boolean;
}) {
  const { header } = payload;
  const disabledReason = disabled
    ? (header.capabilities.reason ??
      "This post changed while you were reviewing.")
    : null;

  const buttons: {
    action: DecisionAction;
    label: string;
    variant: "default" | "outline" | "destructive";
  }[] = [
    { action: "APPROVE", label: "Approve", variant: "default" },
    { action: "REQUEST_CHANGES", label: "Request changes", variant: "outline" },
    { action: "REJECT", label: "Reject", variant: "destructive" },
  ];

  return (
    <div className="space-y-4">
      <div>
        {/* Not "Decision" — the mobile Sheet wrapping this already carries that heading (SheetTitle), and a duplicate accessible name is ambiguous. */}
        <h2 className="text-sm font-semibold">Decide</h2>
        <p className="text-muted-foreground text-sm">
          Reviewing version {header.currentVersionNumber}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {buttons.map(({ action, label, variant }) => {
          const button = (
            <Button
              key={action}
              type="button"
              variant={variant}
              disabled={disabledReason !== null}
              onClick={() => onDecide(action)}
              className="justify-start"
            >
              {label}
            </Button>
          );
          if (!disabledReason) return button;
          return (
            <Tooltip key={action}>
              <TooltipTrigger asChild>
                <span>{button}</span>
              </TooltipTrigger>
              <TooltipContent>{disabledReason}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div>
        <Label htmlFor="decision-comment">
          Comment (required for changes and rejection)
        </Label>
        <Textarea
          id="decision-comment"
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          disabled={disabledReason !== null}
          rows={3}
        />
      </div>
      <div className="border-t pt-4">
        {header.dueAt && header.slaPercentElapsed !== null ? (
          <>
            <SLAIndicator
              percentElapsed={header.slaPercentElapsed}
              remainderText={`${header.slaPercentElapsed}%`}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Due {formatDateTime(header.dueAt)}
              {header.warningAt &&
                ` · Warning at ${formatDateTime(header.warningAt)}`}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">SLA not yet set.</p>
        )}
      </div>
    </div>
  );
}

export function ApprovalReviewView({
  initialPayload,
}: {
  initialPayload: ApprovalReviewDto;
}) {
  const router = useRouter();
  const { toast } = useToast();
  // Deliberately not re-fetched into state: UI_UX_SPEC.md §5's own copy
  // for a concurrency change is "Reload to see version N" — a manual
  // reload, not a silent swap — so `payload` stays exactly what the page
  // loaded with for the life of this component.
  const payload = initialPayload;
  const [comment, setComment] = useState("");
  const [confirmAction, setConfirmAction] = useState<DecisionAction | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [staleBanner, setStaleBanner] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const initialLockVersion = useRef(initialPayload.header.lockVersion);
  const initialStatus = useRef(initialPayload.header.status);

  const { header } = payload;
  const canDecide =
    header.capabilities.canDecide && !result && staleBanner === null;

  useEffect(() => {
    if (result) return;
    const interval = setInterval(() => {
      getJson<ApprovalReviewDto>(`/api/v1/approvals/${header.postId}`)
        .then((fresh) => {
          if (
            fresh.header.lockVersion !== initialLockVersion.current ||
            fresh.header.status !== initialStatus.current
          ) {
            setStaleBanner(fresh.header.currentVersionNumber);
          }
        })
        .catch(() => {
          // Transient poll failures don't block the reviewer.
        });
    }, CONCURRENCY_POLL_MS);
    return () => clearInterval(interval);
  }, [header.postId, result]);

  const submitDecision = useCallback(
    async (action: DecisionAction) => {
      setSubmitting(true);
      try {
        const body: Record<string, unknown> = {
          postVersionId: header.currentVersionId,
          lockVersion: header.lockVersion,
        };
        if (action === "REJECT") body.reason = comment;
        else body.comment = comment;

        await postJson(
          `/api/v1/approvals/${header.postId}/${DECISION_ENDPOINT[action]}`,
          body,
          { csrfCookieName: CSRF_COOKIE_NAME },
        );
        setResult({
          action,
          version: header.currentVersionNumber,
          at: new Date().toISOString(),
        });
        setConfirmAction(null);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "Couldn't record the decision.";
        toast({ title: message, variant: "destructive" });
      } finally {
        setSubmitting(false);
      }
    },
    [header, comment, toast],
  );

  const requestDecision = useCallback(
    (action: DecisionAction) => {
      if (!canDecide) return;
      if (
        (action === "REQUEST_CHANGES" || action === "REJECT") &&
        !comment.trim()
      ) {
        toast({
          title:
            action === "REJECT"
              ? "A reason is required to reject."
              : "A comment is required to request changes.",
          variant: "destructive",
        });
        return;
      }
      setConfirmAction(action);
      setMobileSheetOpen(false);
    },
    [canDecide, comment, toast],
  );

  const goToNext = useCallback(async () => {
    try {
      const next = await getJson<{ postId: string } | null>(
        `/api/v1/approvals/next?after=${header.postId}`,
      );
      router.push(next ? `/approvals/${next.postId}` : "/approvals");
    } catch {
      router.push("/approvals");
    }
  }, [header.postId, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      if (event.key === "?") {
        setHelpOpen(true);
      } else if (event.key.toLowerCase() === "a") {
        requestDecision("APPROVE");
      } else if (event.key.toLowerCase() === "c") {
        requestDecision("REQUEST_CHANGES");
      } else if (event.key.toLowerCase() === "r") {
        requestDecision("REJECT");
      } else if (event.key.toLowerCase() === "k") {
        void goToNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestDecision, goToNext]);

  if (result) {
    return (
      <div>
        <PageHeader
          title={header.title}
          breadcrumbs={[
            { label: "Approvals", href: "/approvals" },
            { label: header.reference },
          ]}
        />
        <div className="rounded-md border p-6 text-center">
          <p className="text-lg font-semibold">
            {DECISION_RESULT_LABEL[result.action]}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Version {result.version} · {formatDateTime(result.at)}
          </p>
          <Button className="mt-4" onClick={goToNext}>
            Next in queue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={header.title}
        breadcrumbs={[
          { label: "Approvals", href: "/approvals" },
          { label: header.reference },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={goToNext}>
            Next ›
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={header.status} />
        <PriorityBadge priority={header.priority} />
        <span>v{header.currentVersionNumber}</span>
        {header.waitingHours !== null && (
          <span className="text-muted-foreground">
            Waiting {header.waitingHours}h
          </span>
        )}
        <span className="text-muted-foreground">
          {header.creatorName}
          {header.departmentName && ` · ${header.departmentName}`}
          {header.submittedAt &&
            ` · Submitted ${formatDateTime(header.submittedAt)}`}
          {header.assigneeName && ` · Assigned to ${header.assigneeName}`}
        </span>
      </div>

      {staleBanner !== null && (
        <div className="border-warning bg-warning/10 mb-4 rounded-md border p-3 text-sm">
          This post changed while you were reviewing. Reload to see version{" "}
          {staleBanner}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <Tabs defaultValue={payload.diff ? "compare" : "preview"}>
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              {payload.diff && (
                <TabsTrigger value="compare">
                  Compare v{payload.diff.from.versionNumber} → v
                  {payload.diff.to.versionNumber}
                </TabsTrigger>
              )}
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
            </TabsList>
            <TabsContent value="preview">
              <h2 className="text-lg font-semibold">
                {payload.currentVersion.title}
              </h2>
              <div
                className="prose prose-sm mt-3 max-w-none"
                dangerouslySetInnerHTML={{
                  __html: payload.currentVersion.contentHtml,
                }}
              />
            </TabsContent>
            {payload.diff && (
              <TabsContent value="compare">
                <VersionDiff
                  textDiff={payload.diff.textDiff}
                  attachmentDelta={payload.diff.attachmentDelta}
                  titleChanged={payload.diff.titleChanged}
                />
              </TabsContent>
            )}
            <TabsContent value="attachments">
              {payload.currentVersion.attachments.length === 0 ? (
                <EmptyState icon={FileText} title="No attachments." />
              ) : (
                <div className="flex flex-wrap gap-3">
                  {payload.currentVersion.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="bg-muted size-24 overflow-hidden rounded-md border"
                    >
                      {attachment.hasThumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element -- authenticated, non-static endpoint.
                        <img
                          src={`/api/v1/attachments/${attachment.id}/thumbnail`}
                          alt={attachment.originalFilename}
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-4 space-y-6 rounded-md border p-4">
            <DecisionPanelContent
              payload={payload}
              comment={comment}
              onCommentChange={setComment}
              onDecide={requestDecision}
              disabled={!canDecide}
            />
            <HistoryAndComments payload={payload} />
          </div>
        </aside>
      </div>

      <div className="bg-background fixed inset-x-0 bottom-0 z-40 border-t p-3 lg:hidden">
        <Button className="w-full" onClick={() => setMobileSheetOpen(true)}>
          Decide
        </Button>
      </div>
      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto p-4"
        >
          <SheetHeader>
            <SheetTitle>Decision</SheetTitle>
          </SheetHeader>
          <DecisionPanelContent
            payload={payload}
            comment={comment}
            onCommentChange={setComment}
            onDecide={requestDecision}
            disabled={!canDecide}
          />
        </SheetContent>
      </Sheet>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction && DECISION_VERB[confirmAction]} version{" "}
              {header.currentVersionNumber} of {header.reference}?
            </DialogTitle>
            <DialogDescription>
              This {confirmAction === "APPROVE" ? "approval" : "decision"} will
              reference version {header.currentVersionNumber} only.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => confirmAction && submitDecision(confirmAction)}
              disabled={submitting}
            >
              {submitting ? "Submitting…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            <li>
              <kbd>A</kbd> Approve
            </li>
            <li>
              <kbd>C</kbd> Request changes
            </li>
            <li>
              <kbd>R</kbd> Reject
            </li>
            <li>
              <kbd>K</kbd> Next queue item
            </li>
            <li>
              <kbd>?</kbd> This help
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryAndComments({ payload }: { payload: ApprovalReviewDto }) {
  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <h2 className="text-sm font-semibold">HISTORY</h2>
        {payload.history.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No history yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {payload.history.map((entry) => (
              <li key={entry.id}>
                <span className="font-medium">{entry.actorName}</span>{" "}
                <span className="text-muted-foreground">
                  {entry.action && ACTION_LABELS[entry.action]} version{" "}
                  {entry.versionNumber}
                </span>
                {entry.detail && (
                  <p className="text-muted-foreground">
                    &ldquo;{entry.detail}&rdquo;
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t pt-4">
        <h2 className="text-sm font-semibold">COMMENTS (0)</h2>
        <EmptyState icon={MessageSquare} title="No comments yet." />
      </div>
    </div>
  );
}
