import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import {
  protectedHandler,
  NotFoundError,
  WorkflowError,
} from "@/server/http/handler";

/**
 * Exercises the protected-handler wrapper end to end through real
 * NextRequest objects — session resolution, CSRF, Zod validation, resource
 * loading, authorization, workflow guard and error mapping — using a
 * synthetic "owned post" resource, since no real posts module exists yet
 * (Phase 8). Covers the exact negative cases Phase 5's exit criteria name:
 * employee-cannot-approve and cross-user-draft-access.
 */

const CSRF_TOKEN = "test-csrf-token";
const bodySchema = z.object({
  title: z.string().min(1),
  targetCreatorId: z.string().nullable(),
});

const editOwnHandler = protectedHandler<
  z.infer<typeof bodySchema>,
  { creatorId: string }
>(
  {
    schema: bodySchema,
    permission: "POST_EDIT_OWN",
    loadResource: async ({ input }) => {
      if (input.targetCreatorId === null) return null;
      return {
        resource: { creatorId: input.targetCreatorId },
        policyResource: {
          kind: "owned-post",
          creatorId: input.targetCreatorId,
        },
      };
    },
  },
  async ({ input, resource }) => ({
    data: { title: input.title, creatorId: resource.creatorId },
  }),
);

const approveHandler = protectedHandler<{ title: string }, undefined>(
  { schema: z.object({ title: z.string() }), permission: "POST_APPROVE" },
  async ({ input }) => ({ data: { title: input.title } }),
);

const openHandler = protectedHandler<undefined, undefined>({}, async () => ({
  data: { ok: true },
}));

const notFoundHandler = protectedHandler<undefined, undefined>(
  { loadResource: async () => null },
  async () => ({ data: { ok: true } }),
);

const workflowGuardHandler = protectedHandler<undefined, undefined>(
  {
    workflowGuard: () => {
      throw new WorkflowError("Already decided.", "ALREADY_DECIDED");
    },
  },
  async () => ({ data: { ok: true } }),
);

const explodingHandler = protectedHandler<undefined, undefined>(
  {},
  async () => {
    throw new Error("boom — implementation detail that must never leak");
  },
);

const notFoundErrorHandler = protectedHandler<undefined, undefined>(
  {},
  async () => {
    throw new NotFoundError("Widget not found.");
  },
);

const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function makeSessionCookie(
  overrides: {
    permissions?: string[];
  } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `handler-${randomUUID()}@authtest.local`,
      displayName: "Handler Test User",
      firstName: "Handler",
      lastName: "User",
      authProvider: "LOCAL",
      passwordHash: "argon2id$fake$hash$for$testing",
    },
  });
  createdUserIds.push(user.id);

  if (overrides.permissions?.length) {
    const role = await prisma.role.create({
      data: {
        key: `test-role-${randomUUID()}`,
        name: "Test role",
      },
    });
    const permissions = await prisma.permission.findMany({
      where: { key: { in: overrides.permissions } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  const { cookieValue } = await createSession({
    userId: user.id,
    authProvider: "LOCAL",
  });
  return { user, cookieValue };
}

function buildRequest(options: {
  method?: string;
  cookieValue?: string;
  csrf?: boolean;
  body?: unknown;
  origin?: string | null;
}) {
  const headers = new Headers({ "content-type": "application/json" });
  const cookieParts: string[] = [];
  if (options.cookieValue) {
    cookieParts.push(`${SESSION_COOKIE_NAME}=${options.cookieValue}`);
  }
  if (options.csrf) {
    cookieParts.push(`${config.CSRF_COOKIE_NAME}=${CSRF_TOKEN}`);
    headers.set("x-csrf-token", CSRF_TOKEN);
  }
  if (cookieParts.length) headers.set("cookie", cookieParts.join("; "));
  if (options.origin !== null) {
    headers.set("origin", options.origin ?? config.APP_URL);
  }

  return new NextRequest("http://localhost:3000/api/v1/test", {
    method: options.method ?? "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe("protectedHandler", () => {
  it("401s an unauthenticated request before touching CSRF or validation", async () => {
    const request = buildRequest({
      body: { title: "x", targetCreatorId: null },
    });
    const response = await editOwnHandler(request);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("403s a same-origin request missing the CSRF token", async () => {
    const { cookieValue } = await makeSessionCookie({
      permissions: ["POST_EDIT_OWN"],
    });
    const request = buildRequest({
      cookieValue,
      csrf: false,
      body: { title: "x", targetCreatorId: null },
    });
    const response = await editOwnHandler(request);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CSRF_FAILED");
  });

  it("422s a body that fails the Zod schema", async () => {
    const { cookieValue } = await makeSessionCookie({
      permissions: ["POST_EDIT_OWN"],
    });
    const request = buildRequest({
      cookieValue,
      csrf: true,
      body: { title: "", targetCreatorId: null },
    });
    const response = await editOwnHandler(request);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(json.error.details[0].field).toBe("title");
  });

  it("404s when loadResource finds nothing, without ever reaching authorize", async () => {
    const { cookieValue } = await makeSessionCookie({
      permissions: ["POST_EDIT_OWN"],
    });
    const request = buildRequest({
      cookieValue,
      csrf: true,
      body: { title: "x", targetCreatorId: null },
    });
    const response = await editOwnHandler(request);
    expect(response.status).toBe(404);
  });

  it("cross-user draft access: 403s editing another user's post despite holding the grant", async () => {
    const { cookieValue } = await makeSessionCookie({
      permissions: ["POST_EDIT_OWN"],
    });
    const request = buildRequest({
      cookieValue,
      csrf: true,
      body: { title: "x", targetCreatorId: "someone-else" },
    });
    const response = await editOwnHandler(request);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  it("200s editing your own post", async () => {
    const { user, cookieValue } = await makeSessionCookie({
      permissions: ["POST_EDIT_OWN"],
    });
    const request = buildRequest({
      cookieValue,
      csrf: true,
      body: { title: "My post", targetCreatorId: user.id },
    });
    const response = await editOwnHandler(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toEqual({ title: "My post", creatorId: user.id });
  });

  it("employee cannot approve: 403s a grant-only permission the role doesn't hold", async () => {
    const { cookieValue } = await makeSessionCookie({ permissions: [] });
    const request = buildRequest({
      cookieValue,
      csrf: true,
      body: { title: "Approve me" },
    });
    const response = await approveHandler(request);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });

  it("200s a route with no schema or permission for any authenticated user", async () => {
    const { cookieValue } = await makeSessionCookie();
    const request = buildRequest({ cookieValue, csrf: true, body: undefined });
    const response = await openHandler(request);
    expect(response.status).toBe(200);
  });

  it("404s via NotFoundError thrown from loadResource-less routes", async () => {
    const { cookieValue } = await makeSessionCookie();
    const request = buildRequest({ cookieValue, csrf: true });
    const response = await notFoundHandler(request);
    expect(response.status).toBe(404);
  });

  it("404s via NotFoundError thrown from inside execute", async () => {
    const { cookieValue } = await makeSessionCookie();
    const request = buildRequest({ cookieValue, csrf: true });
    const response = await notFoundErrorHandler(request);
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("Widget not found.");
  });

  it("409s via a WorkflowError from the workflow guard, with its code", async () => {
    const { cookieValue } = await makeSessionCookie();
    const request = buildRequest({ cookieValue, csrf: true });
    const response = await workflowGuardHandler(request);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ALREADY_DECIDED");
  });

  it("500s an unexpected error without leaking its message", async () => {
    const { cookieValue } = await makeSessionCookie();
    const request = buildRequest({ cookieValue, csrf: true });
    const response = await explodingHandler(request);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(json.error.message).not.toContain("boom");
  });
});
