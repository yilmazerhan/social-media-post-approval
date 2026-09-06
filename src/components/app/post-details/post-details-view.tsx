"use client";

import { useEffect, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import type {
  PostDetailDto,
  VersionSummaryDto,
  VersionDetailDto,
  VersionCompareDto,
  ActivityEntryDto,
} from "@/modules/posts";
import { getJson } from "@/lib/api-client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/app/status-badge";
import { PriorityBadge } from "@/components/app/priority-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ACTION_LABELS } from "@/components/app/activity-item";
import { CommentThread } from "@/components/app/comments/comment-thread";
import { VersionDiff } from "./version-diff";

function formatDate(value: string | null): string {
  return value ? format(new Date(value), "d MMM yyyy HH:mm") : "—";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function OverviewTab({ post }: { post: PostDetailDto }) {
  const versionMismatch =
    post.currentVersionNumber !== null &&
    post.approvedVersionNumber !== null &&
    post.currentVersionNumber !== post.approvedVersionNumber;

  return (
    <div className="space-y-4">
      {versionMismatch && (
        <div className="border-warning bg-warning/10 rounded-md border p-3 text-sm">
          Version {post.currentVersionNumber} is current, but version{" "}
          {post.approvedVersionNumber} is the one that was approved — they
          differ.
        </div>
      )}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Field label="Status">
          <StatusBadge status={post.status} />
        </Field>
        <Field label="Priority">
          <PriorityBadge priority={post.priority} />
        </Field>
        <Field label="Creator">{post.creatorName}</Field>
        <Field label="Department">{post.departmentName ?? "—"}</Field>
        <Field label="Current version">
          {post.currentVersionNumber ?? "—"}
        </Field>
        <Field label="Approved version">
          {post.approvedVersionNumber ?? "—"}
        </Field>
        <Field label="Approver">{post.approverName ?? "—"}</Field>
        <Field label="Submitted">{formatDate(post.submittedAt)}</Field>
        <Field label="Decided">{formatDate(post.decidedAt)}</Field>
        <Field label="Due">{formatDate(post.dueAt)}</Field>
        {post.rejectionReason && (
          <Field label="Rejection reason">{post.rejectionReason}</Field>
        )}
      </dl>
    </div>
  );
}

function PreviewTab({ version }: { version: VersionDetailDto | null }) {
  if (!version) {
    return (
      <EmptyState icon={FileText} title="No version has been submitted yet." />
    );
  }
  return (
    <div>
      <h2 className="text-lg font-semibold">{version.title}</h2>
      <div
        className="prose prose-sm mt-3 max-w-none"
        dangerouslySetInnerHTML={{ __html: version.contentHtml }}
      />
      {version.attachments.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {version.attachments.map((attachment) => (
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
    </div>
  );
}

function VersionsTab({
  postId,
  versions,
}: {
  postId: string;
  versions: VersionSummaryDto[];
}) {
  // Defaults to "previous → current" — UI_UX_SPEC.md §5. `versions` is
  // ordered newest-first, so index 0 is current and index 1 is previous.
  const [fromId, setFromId] = useState(
    versions[1]?.id ?? versions[0]?.id ?? "",
  );
  const [toId, setToId] = useState(versions[0]?.id ?? "");
  const [compare, setCompare] = useState<VersionCompareDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!fromId || !toId) return;
    let cancelled = false;
    setLoading(true);
    getJson<VersionCompareDto>(
      `/api/v1/posts/${postId}/versions/compare?from=${fromId}&to=${toId}`,
    )
      .then((result) => {
        if (!cancelled) setCompare(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, fromId, toId]);

  if (versions.length === 0) {
    return <EmptyState icon={FileText} title="No versions yet." />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <ul className="space-y-2">
        {versions.map((version) => (
          <li key={version.id} className="rounded-md border p-2 text-sm">
            <div className="font-medium">
              Version {version.versionNumber} — {version.title}
            </div>
            <div className="text-muted-foreground text-xs">
              {version.createdByName} · {formatDate(version.createdAt)}
            </div>
            {version.changeSummary && (
              <div className="mt-1 text-xs">{version.changeSummary}</div>
            )}
          </li>
        ))}
      </ul>

      <div>
        {versions.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger aria-label="Compare from version" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    Version {v.versionNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden>→</span>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger aria-label="Compare to version" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    Version {v.versionNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {loading && (
          <p className="text-muted-foreground text-sm">Loading comparison…</p>
        )}
        {compare && !loading && (
          <VersionDiff
            textDiff={compare.textDiff}
            attachmentDelta={compare.attachmentDelta}
            titleChanged={compare.titleChanged}
          />
        )}
      </div>
    </div>
  );
}

function ActivityList({
  entries,
  emptyTitle,
}: {
  entries: ActivityEntryDto[];
  emptyTitle: string;
}) {
  if (entries.length === 0) {
    return <EmptyState icon={FileText} title={emptyTitle} />;
  }
  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3 text-sm">
          <span className="bg-muted-foreground mt-1.5 size-1.5 shrink-0 rounded-full" />
          <div className="min-w-0">
            <p>
              <span className="font-medium">{entry.actorName ?? "System"}</span>{" "}
              <span className="text-muted-foreground">
                {entry.type === "VERSION_CREATED" &&
                  `submitted version ${entry.versionNumber}`}
                {entry.type === "ACTION" &&
                  entry.action &&
                  `${ACTION_LABELS[entry.action]} version ${entry.versionNumber}`}
                {entry.type === "COMMENT" && "commented"}
              </span>
            </p>
            {entry.detail && (
              <p className="text-muted-foreground mt-0.5">
                &ldquo;{entry.detail}&rdquo;
              </p>
            )}
            <time
              dateTime={entry.createdAt}
              className="text-muted-foreground text-xs"
            >
              {formatDate(entry.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PostDetailsView({
  post,
  versions,
  activity,
  latestVersion,
}: {
  post: PostDetailDto;
  versions: VersionSummaryDto[];
  activity: ActivityEntryDto[];
  latestVersion: VersionDetailDto | null;
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        <TabsTrigger value="versions">Versions</TabsTrigger>
        <TabsTrigger value="history">Approval history</TabsTrigger>
        <TabsTrigger value="comments">Comments</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab post={post} />
      </TabsContent>
      <TabsContent value="preview">
        <PreviewTab version={latestVersion} />
      </TabsContent>
      <TabsContent value="versions">
        <VersionsTab postId={post.id} versions={versions} />
      </TabsContent>
      <TabsContent value="history">
        <ActivityList
          entries={activity.filter((entry) => entry.type === "ACTION")}
          emptyTitle="No approval decisions yet."
        />
      </TabsContent>
      <TabsContent value="comments">
        <CommentThread postId={post.id} />
      </TabsContent>
      <TabsContent value="activity">
        <ActivityList entries={activity} emptyTitle="No activity yet." />
      </TabsContent>
    </Tabs>
  );
}
