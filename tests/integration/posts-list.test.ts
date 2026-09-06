import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { listPosts } from "@/modules/posts";
import {
  GET as listPostsRoute,
  POST as createPost,
} from "@/app/api/v1/posts/route";
import { DELETE as deletePostRoute } from "@/app/api/v1/posts/[id]/route";
import { POST as duplicatePostRoute } from "@/app/api/v1/posts/[id]/duplicate/route";

/**
 * The "My Posts" list, delete, and duplicate endpoints — API.md's
 * `GET /`, `DELETE /:id`, `POST /:id/duplicate` — exercised as real route
 * handlers, the same way tests/integration/posts-routes.test.ts already
 * does for the rest of the Posts surface.
 */

const CSRF_TOKEN = "test-csrf-token";
const createdUserIds: string[] = [];
const createdPostIds: string[] = [];

afterAll(async () => {
  if (createdPostIds.length) {
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function makeAuthedUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `postslist-${randomUUID()}@editortest.local`,
      displayName,
      firstName: displayName,
      lastName: "Test",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);

  const role = await prisma.role.findUniqueOrThrow({
    where: { key: "EMPLOYEE" },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  const { cookieValue } = await createSession({
    userId: user.id,
    authProvider: "LOCAL",
  });
  return { user, cookieValue };
}

function buildRequest(options: {
  url: string;
  method?: string;
  cookieValue: string;
  body?: unknown;
}) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: config.APP_URL,
    cookie: `${SESSION_COOKIE_NAME}=${options.cookieValue}; ${config.CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
    "x-csrf-token": CSRF_TOKEN,
  });
  return new NextRequest(options.url, {
    method: options.method ?? "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createDraftPost(cookieValue: string, title: string) {
  const response = await createPost(
    buildRequest({
      url: "http://localhost:3000/api/v1/posts",
      cookieValue,
      body: { title },
    }),
  );
  const created = (await response.json()).data as { id: string };
  createdPostIds.push(created.id);
  return created.id;
}

describe("listPosts", () => {
  it("scopes to the requesting user and the tab's statuses", async () => {
    const { user, cookieValue } = await makeAuthedUser("List Module Creator");
    const draftId = await createDraftPost(cookieValue, "List module draft");

    const all = await listPosts(user.id, { tab: "all" });
    expect(all.some((r) => r.id === draftId)).toBe(true);

    const drafts = await listPosts(user.id, { tab: "drafts" });
    expect(drafts.some((r) => r.id === draftId)).toBe(true);

    const approved = await listPosts(user.id, { tab: "approved" });
    expect(approved.some((r) => r.id === draftId)).toBe(false);
  });
});

describe("GET /api/v1/posts", () => {
  it("returns only the requesting user's own posts", async () => {
    const { cookieValue } = await makeAuthedUser("List Route Creator");
    const { cookieValue: strangerCookie } = await makeAuthedUser(
      "List Route Stranger",
    );

    const postId = await createDraftPost(cookieValue, "My own post");
    const strangerPostId = await createDraftPost(
      strangerCookie,
      "Someone else's post",
    );

    const response = await listPostsRoute(
      buildRequest({
        url: "http://localhost:3000/api/v1/posts?tab=drafts",
        method: "GET",
        cookieValue,
      }),
    );
    expect(response.status).toBe(200);
    const rows = (await response.json()).data as { id: string }[];
    expect(rows.some((r) => r.id === postId)).toBe(true);
    expect(rows.some((r) => r.id === strangerPostId)).toBe(false);
  });

  it("422s an invalid tab", async () => {
    const { cookieValue } = await makeAuthedUser("List Route Validator");
    const response = await listPostsRoute(
      buildRequest({
        url: "http://localhost:3000/api/v1/posts?tab=bogus",
        method: "GET",
        cookieValue,
      }),
    );
    expect(response.status).toBe(422);
  });
});

describe("DELETE /api/v1/posts/:id", () => {
  it("soft-deletes a draft, and 409s a non-draft", async () => {
    const { cookieValue } = await makeAuthedUser("Delete Route Creator");
    const postId = await createDraftPost(cookieValue, "To be deleted");

    const response = await deletePostRoute(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${postId}`,
        method: "DELETE",
        cookieValue,
      }),
      routeParams(postId),
    );
    expect(response.status).toBe(200);

    const row = await prisma.post.findUnique({ where: { id: postId } });
    expect(row?.deletedAt).not.toBeNull();

    // Not in "drafts" anymore.
    const stillListed = await listPosts(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .creatorId,
      { tab: "drafts" },
    );
    expect(stillListed.some((r) => r.id === postId)).toBe(false);
  });

  it("403s a stranger trying to delete someone else's draft", async () => {
    const { cookieValue } = await makeAuthedUser("Delete Route Owner");
    const { cookieValue: strangerCookie } = await makeAuthedUser(
      "Delete Route Stranger",
    );
    const postId = await createDraftPost(cookieValue, "Owned draft");

    const response = await deletePostRoute(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${postId}`,
        method: "DELETE",
        cookieValue: strangerCookie,
      }),
      routeParams(postId),
    );
    expect(response.status).toBe(403);
  });
});

describe("POST /api/v1/posts/:id/duplicate", () => {
  it("creates a new draft seeded from the source post", async () => {
    const { cookieValue } = await makeAuthedUser("Duplicate Route Creator");
    const sourceId = await createDraftPost(cookieValue, "Original post");

    const response = await duplicatePostRoute(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${sourceId}/duplicate`,
        cookieValue,
      }),
      routeParams(sourceId),
    );
    expect(response.status).toBe(201);
    const duplicated = (await response.json()).data as { id: string };
    createdPostIds.push(duplicated.id);
    expect(duplicated.id).not.toBe(sourceId);

    const row = await prisma.post.findUnique({ where: { id: duplicated.id } });
    expect(row?.title).toBe("Copy of Original post");
    expect(row?.status).toBe("DRAFT");
  });

  it("403s a stranger duplicating someone else's post", async () => {
    const { cookieValue } = await makeAuthedUser("Duplicate Route Owner");
    const { cookieValue: strangerCookie } = await makeAuthedUser(
      "Duplicate Route Stranger",
    );
    const sourceId = await createDraftPost(cookieValue, "Private post");

    const response = await duplicatePostRoute(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${sourceId}/duplicate`,
        cookieValue: strangerCookie,
      }),
      routeParams(sourceId),
    );
    expect(response.status).toBe(403);
  });
});
