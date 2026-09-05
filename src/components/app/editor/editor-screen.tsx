"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { JSONContent } from "@tiptap/core";
import { ChevronLeft, Eye, Settings2 } from "lucide-react";
import type { Priority } from "@/generated/prisma/client";
import type {
  PostEditorDto,
  ReadinessChecklist as ReadinessChecklistData,
} from "@/modules/posts";
import type { AttachmentDto } from "@/modules/attachments";
import { renderContentHtml } from "@/modules/posts/content-render";
import {
  getJson,
  patchJson,
  postJson,
  CSRF_COOKIE_NAME,
} from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RichTextEditor } from "./rich-text-editor";
import { MediaUploader } from "./media-uploader";
import { AutosaveStatusChip } from "./autosave-status";
import { useAutosave } from "./use-autosave";
import { useDraftRecovery } from "./use-draft-recovery";
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard";
import { ReadinessChecklist } from "./readiness-checklist";
import { PostSettingsPanel } from "./post-settings-panel";
import { ChangesRequestedBanner } from "./changes-requested-banner";
import { PreviewDialog } from "./preview-dialog";
import { SubmitConfirmationDialog } from "./submit-confirmation-dialog";
import { SubmissionConfirmation } from "./submission-confirmation";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";

export interface EditorScreenProps {
  post: PostEditorDto;
  departments: { id: string; name: string }[];
  maxCharacters: number;
  autosaveIntervalSeconds: number;
  maxAttachments: number;
  maxUploadSize: number;
  allowedAttachmentTypes: string[];
}

interface SubmitResult {
  reference: string;
  versionNumber: number;
  assigneeName: string | null;
}

export function EditorScreen({
  post,
  departments,
  maxCharacters,
  autosaveIntervalSeconds,
  maxAttachments,
  maxUploadSize,
  allowedAttachmentTypes,
}: EditorScreenProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Frozen at mount — a router.refresh() after a successful submit
  // re-delivers this post with canEdit now false (its status moved past
  // DRAFT), which must not retroactively hide the view already on screen.
  const [canEditInitially] = useState(post.capabilities.canEdit);

  const [title, setTitle] = useState(post.draftTitle ?? "");
  const [content, setContent] = useState<JSONContent>(post.draftContentJson);
  const [priority, setPriority] = useState<Priority>(post.priority);
  const [departmentId, setDepartmentId] = useState(post.departmentId);
  const [changeSummary, setChangeSummary] = useState(post.changeSummary ?? "");
  const [attachments, setAttachments] = useState<AttachmentDto[]>(
    post.attachments,
  );
  const [lockVersion, setLockVersion] = useState(post.lockVersion);
  const [readiness, setReadiness] = useState<ReadinessChecklistData | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readinessSummaryOpen, setReadinessSummaryOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const draftRecovery = useDraftRecovery({
    postId: post.id,
    serverDraftUpdatedAt: post.draftUpdatedAt,
  });

  const refreshReadiness = useCallback(async () => {
    try {
      const result = await getJson<ReadinessChecklistData>(
        `/api/v1/posts/${post.id}/validate`,
      );
      setReadiness(result);
    } catch {
      // A failed readiness refresh isn't fatal — submit re-validates
      // server-side regardless, so this is best-effort UI freshness.
    }
  }, [post.id]);

  useEffect(() => {
    void refreshReadiness();
  }, [refreshReadiness]);

  const persistDraft = useCallback(
    async (nextTitle: string, nextContent: JSONContent) => {
      await postJson(
        `/api/v1/posts/${post.id}/autosave`,
        { title: nextTitle, contentJson: nextContent },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      draftRecovery.clearStash();
      void refreshReadiness();
    },
    [post.id, draftRecovery, refreshReadiness],
  );

  const autosave = useAutosave({
    title,
    content,
    intervalSeconds: autosaveIntervalSeconds,
    enabled: true,
    onSave: persistDraft,
  });

  useEffect(() => {
    draftRecovery.stash(title, content);
    // Only re-stash when the content actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  useUnsavedChangesGuard(autosave.dirty);

  async function patchMetadata(patch: Record<string, unknown>) {
    const result = await patchJson<{ lockVersion: number }>(
      `/api/v1/posts/${post.id}`,
      { lockVersion, ...patch },
      { csrfCookieName: CSRF_COOKIE_NAME },
    );
    setLockVersion(result.lockVersion);
    void refreshReadiness();
  }

  function handlePriorityChange(next: Priority) {
    setPriority(next);
    patchMetadata({ priority: next }).catch(() => {
      toast({ title: "Couldn't save priority.", variant: "destructive" });
    });
  }

  function handleDepartmentChange(next: string) {
    setDepartmentId(next);
    patchMetadata({ departmentId: next }).catch(() => {
      toast({ title: "Couldn't save department.", variant: "destructive" });
    });
  }

  function handleAttachmentsChange(next: AttachmentDto[]) {
    setAttachments(next);
    patchMetadata({ attachmentIds: next.map((a) => a.id) }).catch(() => {
      toast({ title: "Couldn't save media changes.", variant: "destructive" });
    });
  }

  function handleChangeSummaryBlur() {
    patchMetadata({ changeSummary: changeSummary || null }).catch(() => {
      toast({ title: "Couldn't save change summary.", variant: "destructive" });
    });
  }

  function restoreLocalDraft() {
    if (!draftRecovery.recoverable) return;
    setTitle(draftRecovery.recoverable.title);
    setContent(draftRecovery.recoverable.content);
    draftRecovery.dismiss();
  }

  function focusReadinessField(key: string) {
    if (key === "title") titleInputRef.current?.focus();
    if (key === "department") setSettingsOpen(true);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      autosave.saveNow();
      const result = await postJson<SubmitResult>(
        `/api/v1/posts/${post.id}/submit`,
        { lockVersion },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      draftRecovery.clearStash();
      setSubmitResult(result);
      setSubmitDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn't submit this post.",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitResult) {
    return (
      <SubmissionConfirmation
        reference={submitResult.reference}
        versionNumber={submitResult.versionNumber}
        assigneeName={submitResult.assigneeName}
        postId={post.id}
      />
    );
  }

  if (!canEditInitially) {
    return (
      <div>
        <PageHeader
          title="Edit post"
          breadcrumbs={[
            { label: "My Posts", href: "/posts" },
            { label: "Edit" },
          ]}
        />
        <ErrorState message="This post can't be edited — it isn't yours, or it's already past the draft stage." />
      </div>
    );
  }

  const contentHtml = renderContentHtml(content as never);
  const readyCount = readiness?.items.filter((i) => i.passed).length ?? 0;
  const totalCount = readiness?.items.length ?? 0;

  const settingsPanel = (
    <PostSettingsPanel
      priority={priority}
      onPriorityChange={handlePriorityChange}
      departmentId={departmentId}
      onDepartmentChange={handleDepartmentChange}
      departments={departments}
      changeSummary={changeSummary}
      onChangeSummaryChange={setChangeSummary}
      onChangeSummaryBlur={handleChangeSummaryBlur}
      routePreview={readiness?.routePreview ?? null}
    />
  );

  return (
    <div className="pb-20 lg:pb-0">
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/posts"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ChevronLeft className="size-4" aria-hidden />
            My Posts
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-medium">
            {title || "Untitled post"}
          </span>
          <AutosaveStatusChip
            status={autosave.status}
            savedAt={autosave.savedAt}
          />
        </div>
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye aria-hidden /> Preview
          </Button>
          <Button variant="outline" onClick={autosave.saveNow}>
            Save draft
          </Button>
          <Button
            onClick={() => setSubmitDialogOpen(true)}
            disabled={!readiness?.ready}
          >
            Submit
          </Button>
        </div>
        <Button
          variant="outline"
          className="lg:hidden"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 aria-hidden /> Settings &amp; readiness
        </Button>
      </div>

      {draftRecovery.recoverable && (
        <div
          role="alert"
          className="bg-warning/10 border-warning mt-4 flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
        >
          <span>
            Restore unsaved changes from{" "}
            {new Date(draftRecovery.recoverable.savedAt).toLocaleTimeString(
              undefined,
              { hour: "2-digit", minute: "2-digit" },
            )}
            ?
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={restoreLocalDraft}>
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={draftRecovery.dismiss}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {post.changesRequested && (
            <ChangesRequestedBanner banner={post.changesRequested} />
          )}

          <div className="space-y-1.5">
            <label htmlFor="post-title" className="sr-only">
              Title
            </label>
            <Input
              id="post-title"
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="text-base font-medium"
              maxLength={300}
            />
          </div>

          <div className="mt-3">
            <RichTextEditor
              content={content}
              onChange={setContent}
              characterLimit={maxCharacters}
              onBlur={autosave.saveNow}
            />
          </div>

          <MediaUploader
            attachments={attachments}
            onChange={handleAttachmentsChange}
            maxAttachments={maxAttachments}
            maxUploadSize={maxUploadSize}
            allowedTypes={allowedAttachmentTypes}
          />
        </div>

        <div className="hidden lg:block">
          {readiness && (
            <ReadinessChecklist
              items={readiness.items}
              onFocusField={focusReadinessField}
            />
          )}
          <div className="mt-6">{settingsPanel}</div>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Settings &amp; readiness</SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-4">
            {readiness && (
              <ReadinessChecklist
                items={readiness.items}
                onFocusField={focusReadinessField}
              />
            )}
            {settingsPanel}
          </div>
        </SheetContent>
      </Sheet>

      <div className="bg-background fixed inset-x-0 bottom-0 z-40 border-t p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setReadinessSummaryOpen((v) => !v)}
          className="mb-2 w-full text-left text-xs font-medium"
        >
          {readyCount} of {totalCount} ready
          {readinessSummaryOpen && readiness && (
            <ul className="mt-1 space-y-0.5 font-normal">
              {readiness.items.map((item) => (
                <li
                  key={item.key}
                  className={item.passed ? "text-success" : "text-destructive"}
                >
                  {item.passed ? "✓" : "✗"} {item.label}
                </li>
              ))}
            </ul>
          )}
        </button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={autosave.saveNow}
          >
            Save draft
          </Button>
          <Button
            className="flex-1"
            disabled={!readiness?.ready}
            onClick={() => setSubmitDialogOpen(true)}
          >
            Submit
          </Button>
        </div>
      </div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={title}
        contentHtml={contentHtml}
        attachments={attachments}
      />
      <SubmitConfirmationDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
        routePreview={readiness?.routePreview ?? null}
      />
    </div>
  );
}
