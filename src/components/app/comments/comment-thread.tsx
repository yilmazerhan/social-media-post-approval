"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import type { CommentDto, MentionableUserDto } from "@/modules/comments";
import {
  getJson,
  postJson,
  patchJson,
  deleteJson,
  CSRF_COOKIE_NAME,
} from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/empty-state";
import { useToast } from "@/hooks/use-toast";

/**
 * UI_UX_SPEC.md's Comments section, shared by Post Details' Comments tab
 * and Approval Review's sidebar. `@` autocomplete queries
 * `GET /users/mentionable?q=`; selecting a suggestion inserts its exact
 * `displayName` so the server's own name-matching (mentions.ts) can find
 * it unambiguously — nothing about the mention is trusted from here, the
 * server re-parses the body itself (DATABASE.md §6).
 */

function formatDateTime(value: string): string {
  return format(new Date(value), "d MMM yyyy HH:mm");
}

interface MentionQuery {
  atIndex: number;
  text: string;
}

function findActiveMentionQuery(
  value: string,
  cursor: number,
): MentionQuery | null {
  const upToCursor = value.slice(0, cursor);
  const atIndex = upToCursor.lastIndexOf("@");
  if (atIndex === -1) return null;
  const between = upToCursor.slice(atIndex + 1);
  if (between.includes("\n")) return null;
  return { atIndex, text: between };
}

function Composer({
  onSubmit,
  submitting,
  placeholder,
  autoFocus,
}: {
  onSubmit: (body: string) => Promise<void>;
  submitting: boolean;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<MentionableUserDto[]>([]);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!mentionQuery) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    getJson<MentionableUserDto[]>(
      `/api/v1/users/mentionable?q=${encodeURIComponent(mentionQuery.text)}`,
    )
      .then((users) => {
        if (!cancelled) setSuggestions(users);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionQuery]);

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    setValue(next);
    setMentionQuery(
      findActiveMentionQuery(next, event.target.selectionStart ?? next.length),
    );
  }

  function selectSuggestion(user: MentionableUserDto) {
    if (!mentionQuery) return;
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionQuery.atIndex);
    const after = value.slice(cursor);
    const inserted = `@${user.displayName} `;
    const next = `${before}${inserted}${after}`;
    setValue(next);
    setMentionQuery(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  async function handleSubmit() {
    if (!value.trim()) return;
    await onSubmit(value);
    setValue("");
    setMentionQuery(null);
    setSuggestions([]);
  }

  return (
    <div className="relative space-y-2">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMentionQuery(null);
        }}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        aria-label={placeholder}
      />
      {mentionQuery !== null && suggestions.length > 0 && (
        <ul className="bg-popover absolute z-10 mt-1 w-64 rounded-md border shadow-md">
          {suggestions.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                className="hover:bg-accent w-full px-3 py-1.5 text-left text-sm"
                onClick={() => selectSuggestion(user)}
              >
                {user.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !value.trim()}
        >
          {submitting ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  onReplySubmit,
  onEdit,
  onDelete,
  isReply,
}: {
  comment: CommentDto;
  onReplySubmit?: (body: string) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  isReply: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  return (
    <li className={isReply ? "ml-8" : ""}>
      <div className="rounded-md border p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{comment.authorName}</span>
          <time
            dateTime={comment.createdAt}
            className="text-muted-foreground text-xs"
          >
            {formatDateTime(comment.createdAt)}
          </time>
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={2}
              aria-label="Edit comment"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !editValue.trim()}
                onClick={async () => {
                  setBusy(true);
                  await onEdit(comment.id, editValue);
                  setBusy(false);
                  setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p
            className="[&_.mention]:text-primary mt-2"
            dangerouslySetInnerHTML={{ __html: comment.bodyHtml }}
          />
        )}
        {!editing && (
          <div className="mt-2 flex gap-3 text-xs">
            {onReplySubmit && (
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() => setReplying((v) => !v)}
              >
                Reply
              </button>
            )}
            {comment.canEdit && (
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() => {
                  setEditValue(comment.body);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            )}
            {comment.canDelete && (
              <button
                type="button"
                className="text-destructive hover:underline"
                onClick={() => onDelete(comment.id)}
              >
                Delete
              </button>
            )}
          </div>
        )}
        {replying && onReplySubmit && (
          <div className="mt-3">
            <Composer
              onSubmit={async (body) => {
                await onReplySubmit(body);
                setReplying(false);
              }}
              submitting={busy}
              placeholder="Write a reply…"
              autoFocus
            />
          </div>
        )}
      </div>
    </li>
  );
}

export function CommentThread({ postId }: { postId: string }) {
  const { toast } = useToast();
  const [comments, setComments] = useState<CommentDto[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = useCallback(() => {
    getJson<CommentDto[]>(`/api/v1/posts/${postId}/comments`)
      .then(setComments)
      .catch(() => {
        toast({ title: "Couldn't load comments.", variant: "destructive" });
      });
  }, [postId, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handlePost(body: string, parentId?: string) {
    setSubmitting(true);
    try {
      await postJson(
        `/api/v1/posts/${postId}/comments`,
        { body, parentId },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      reload();
    } catch {
      toast({ title: "Couldn't post the comment.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(commentId: string, body: string) {
    try {
      await patchJson(
        `/api/v1/posts/${postId}/comments/${commentId}`,
        { body },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      reload();
    } catch {
      toast({ title: "Couldn't save the comment.", variant: "destructive" });
    }
  }

  async function handleDelete(commentId: string) {
    try {
      await deleteJson(`/api/v1/posts/${postId}/comments/${commentId}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      reload();
    } catch {
      toast({ title: "Couldn't delete the comment.", variant: "destructive" });
    }
  }

  if (comments === null) {
    return <p className="text-muted-foreground text-sm">Loading comments…</p>;
  }

  return (
    <div className="space-y-4">
      <Composer
        onSubmit={(body) => handlePost(body)}
        submitting={submitting}
        placeholder="Write a comment… type @ to mention someone"
      />
      {comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet." />
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-3">
              <CommentItem
                comment={comment}
                onReplySubmit={(body) => handlePost(body, comment.id)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isReply={false}
              />
              {comment.replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  isReply
                />
              ))}
            </div>
          ))}
        </ul>
      )}
    </div>
  );
}
