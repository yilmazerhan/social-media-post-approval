import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { POST as createPost } from "@/app/api/v1/posts/route";
import {
  GET as getPost,
  PATCH as patchPost,
} from "@/app/api/v1/posts/[id]/route";
import { POST as submitPostRoute } from "@/app/api/v1/posts/[id]/submit/route";

/**
 * The Posts endpoints exercised as real route handlers (session, CSRF,
 * authorization, Zod validation and workflow guards all in play) rather
 * than as isolated module calls — proves the wiring, and in particular
 * that hostile content is rejected at the actual HTTP boundary, not just
 * by the schema in isolation.
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
      email: `route-${randomUUID()}@editortest.local`,
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

describe("Posts routes", () => {
  it("creates a draft, then 403s a stranger trying to read it", async () => {
    const { cookieValue } = await makeAuthedUser("Route Creator");
    const { cookieValue: strangerCookie } =
      await makeAuthedUser("Route Stranger");

    const createResponse = await createPost(
      buildRequest({
        url: "http://localhost:3000/api/v1/posts",
        cookieValue,
        body: { title: "Route test post" },
      }),
    );
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()).data as { id: string };
    createdPostIds.push(created.id);

    const ownResponse = await getPost(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${created.id}`,
        method: "GET",
        cookieValue,
      }),
      routeParams(created.id),
    );
    expect(ownResponse.status).toBe(200);
    expect((await ownResponse.json()).data.title).toBe("Route test post");

    const strangerResponse = await getPost(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${created.id}`,
        method: "GET",
        cookieValue: strangerCookie,
      }),
      routeParams(created.id),
    );
    expect(strangerResponse.status).toBe(403);
  });

  it("422s a PATCH whose content uses a node type outside the allowed vocabulary", async () => {
    const { cookieValue } = await makeAuthedUser("Route Hostile Creator");
    const createResponse = await createPost(
      buildRequest({
        url: "http://localhost:3000/api/v1/posts",
        cookieValue,
        body: { title: "Hostile content target" },
      }),
    );
    const created = (await createResponse.json()).data as { id: string };
    createdPostIds.push(created.id);

    const response = await patchPost(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${created.id}`,
        method: "PATCH",
        cookieValue,
        body: {
          lockVersion: 0,
          contentJson: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "click",
                    marks: [
                      { type: "link", attrs: { href: "javascript:alert(1)" } },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }),
      routeParams(created.id),
    );
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");

    const post = await prisma.post.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(post.draftContentJson).toEqual({ type: "doc", content: [] });
  });

  it("409s a submit whose lockVersion is stale", async () => {
    const { cookieValue } = await makeAuthedUser("Route Stale Submit Creator");
    const createResponse = await createPost(
      buildRequest({
        url: "http://localhost:3000/api/v1/posts",
        cookieValue,
        body: { title: "Stale submit target" },
      }),
    );
    const created = (await createResponse.json()).data as { id: string };
    createdPostIds.push(created.id);

    const response = await submitPostRoute(
      buildRequest({
        url: `http://localhost:3000/api/v1/posts/${created.id}/submit`,
        cookieValue,
        body: { lockVersion: 42 },
      }),
      routeParams(created.id),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STALE_RESOURCE");
  });
});
