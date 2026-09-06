/**
 * Server-side mention parsing and rendering — DATABASE.md §6:
 * "`CommentMention`... written by the server after parsing the comment
 * body — the client's claimed mention list is not trusted." The author
 * types `@` followed by another user's exact display name (the
 * autocomplete this module also powers exists precisely so users type an
 * exact, matchable name); nothing else in the body is ever treated as
 * markup, so escaping the whole body and re-inserting one `<strong>`
 * wrapper per matched span is the entire "sanitised rendering" — there is
 * no HTML input path to sanitize away in the first place.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { AuthorizedUser } from "@/modules/authorization";
import { prisma } from "@/server/db";

export interface MentionCandidate {
  id: string;
  displayName: string;
}

/**
 * API.md: "`GET /users/mentionable?q=` powers `@` autocomplete and
 * returns only users the caller may mention." Not post-scoped (the
 * endpoint takes no post id) — visibility here is the same department
 * boundary `checkApprovalRead` already uses, widened to everyone for a
 * `POST_READ_ALL` holder. Pass `limit: null` (comment parsing's own use,
 * which needs the whole candidate pool to match against, not a page of
 * it) to get every candidate rather than an autocomplete-sized page —
 * `undefined` still means "omitted," which keeps the default of 10.
 */
export async function listMentionableUsers(
  authz: AuthorizedUser,
  query: string,
  limit: number | null = 10,
): Promise<MentionCandidate[]> {
  const where: Prisma.UserWhereInput = {
    status: "ACTIVE",
    deletedAt: null,
    displayName: { contains: query, mode: "insensitive" },
  };
  if (!authz.permissions.has("POST_READ_ALL")) {
    where.departmentId = authz.departmentId;
  }
  return prisma.user.findMany({
    where,
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
    ...(limit !== null ? { take: limit } : {}),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface RenderedComment {
  bodyHtml: string;
  mentionedUserIds: string[];
}

/**
 * Finds `@ExactDisplayName` occurrences against the real candidate pool
 * (longest name first, so "Jane Manager" wins over a shorter overlapping
 * name), then re-renders the body from those exact spans so escaping and
 * highlighting can never disagree about what was matched.
 */
export function parseAndRenderComment(
  body: string,
  candidates: MentionCandidate[],
): RenderedComment {
  interface Span {
    start: number;
    end: number;
    userId: string;
  }
  const spans: Span[] = [];
  const byLength = [...candidates].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  );

  for (const user of byLength) {
    if (!user.displayName) continue;
    const pattern = new RegExp(
      `@${escapeRegExp(user.displayName)}(?!\\w)`,
      "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body))) {
      const start = match.index;
      const end = start + match[0].length;
      if (spans.some((s) => start < s.end && end > s.start)) continue;
      spans.push({ start, end, userId: user.id });
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const mentionedUserIds = Array.from(new Set(spans.map((s) => s.userId)));

  let bodyHtml = "";
  let cursor = 0;
  for (const span of spans) {
    bodyHtml += escapeHtml(body.slice(cursor, span.start));
    bodyHtml += `<strong class="mention">${escapeHtml(body.slice(span.start, span.end))}</strong>`;
    cursor = span.end;
  }
  bodyHtml += escapeHtml(body.slice(cursor));

  return { bodyHtml, mentionedUserIds };
}
