// @vitest-environment node
//
// jsdom's Request/FormData/Blob shims don't produce a real streamable
// multipart body (see attachments-pipeline.test.ts) — this file drives
// real route handlers with a real multipart upload, so it needs Node's
// real fetch primitives.
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { getFileStorage } from "@/modules/attachments";
import { POST as createPost } from "@/app/api/v1/posts/route";
import { PATCH as patchPost } from "@/app/api/v1/posts/[id]/route";
import { POST as submitPostRoute } from "@/app/api/v1/posts/[id]/submit/route";
import { POST as uploadAttachment } from "@/app/api/v1/attachments/route";
import { GET as getAttachmentContent } from "@/app/api/v1/attachments/[id]/content/route";
import { DELETE as deleteAttachment } from "@/app/api/v1/attachments/[id]/route";

/**
 * The Attachments endpoints exercised as real route handlers — session,
 * CSRF, and authorization all in play, plus the real upload pipeline. See
 * API.md's `/api/v1/attachments` surface.
 */

const CSRF_TOKEN = "test-csrf-token";
const createdUserIds: string[] = [];
const createdPostIds: string[] = [];

afterAll(async () => {
  const storage = getFileStorage();
  if (createdPostIds.length) {
    await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  }
  // Query by uploader rather than relying on every test remembering to
  // track its attachment id — a soft-deleted (but not yet swept) row
  // still holds its uploadedById FK and would otherwise block user cleanup.
  const allAttachments = await prisma.attachment.findMany({
    where: { uploadedById: { in: createdUserIds } },
  });
  for (const attachment of allAttachments) {
    await storage.delete(attachment.storageKey).catch(() => {});
    if (attachment.thumbnailKey) {
      await storage.delete(attachment.thumbnailKey).catch(() => {});
    }
  }
  await prisma.attachment.deleteMany({
    where: { uploadedById: { in: createdUserIds } },
  });
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function makeAuthedUser(displayName: string) {
  const user = await prisma.user.create({
    data: {
      email: `attach-route-${randomUUID()}@editortest.local`,
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

function baseHeaders(cookieValue: string) {
  return {
    origin: config.APP_URL,
    cookie: `${SESSION_COOKIE_NAME}=${cookieValue}; ${config.CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
    "x-csrf-token": CSRF_TOKEN,
  };
}

function buildJsonRequest(options: {
  url: string;
  method?: string;
  cookieValue: string;
  body?: unknown;
}) {
  const headers = new Headers({
    "content-type": "application/json",
    ...baseHeaders(options.cookieValue),
  });
  return new NextRequest(options.url, {
    method: options.method ?? "POST",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function buildUploadRequest(options: {
  url: string;
  cookieValue: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
}) {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(options.buffer)], { type: options.mimeType }),
    options.filename,
  );
  return new NextRequest(options.url, {
    method: "POST",
    headers: new Headers(baseHeaders(options.cookieValue)),
    body: formData,
  });
}

function buildGetRequest(url: string, cookieValue: string) {
  return new NextRequest(url, {
    method: "GET",
    headers: new Headers(baseHeaders(cookieValue)),
  });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 12,
      height: 8,
      channels: 3,
      background: { r: 5, g: 5, b: 5 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("Attachments routes", () => {
  it("uploads a file and returns TEMPORARY metadata", async () => {
    const { cookieValue } = await makeAuthedUser("Attach Uploader");
    const buffer = await makeJpeg();

    const response = await uploadAttachment(
      buildUploadRequest({
        url: "http://localhost:3000/api/v1/attachments",
        cookieValue,
        buffer,
        filename: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    );
    expect(response.status).toBe(201);
    const attachment = (await response.json()).data as {
      id: string;
      status: string;
    };
    expect(attachment.status).toBe("TEMPORARY");
  });

  it("rejects a crafted file at the HTTP boundary with 415 FILE_TYPE_REJECTED", async () => {
    const { cookieValue } = await makeAuthedUser("Attach Hostile Uploader");
    const response = await uploadAttachment(
      buildUploadRequest({
        url: "http://localhost:3000/api/v1/attachments",
        cookieValue,
        buffer: Buffer.from("not an image"),
        filename: "fake.jpg",
        mimeType: "image/jpeg",
      }),
    );
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe("FILE_TYPE_REJECTED");
  });

  it("lets the uploader read a TEMPORARY attachment, but 403s a stranger", async () => {
    const { cookieValue } = await makeAuthedUser("Attach Owner");
    const { cookieValue: strangerCookie } =
      await makeAuthedUser("Attach Stranger");
    const buffer = await makeJpeg();

    const uploadResponse = await uploadAttachment(
      buildUploadRequest({
        url: "http://localhost:3000/api/v1/attachments",
        cookieValue,
        buffer,
        filename: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    );
    const attachment = (await uploadResponse.json()).data as { id: string };

    const ownResponse = await getAttachmentContent(
      buildGetRequest(
        `http://localhost:3000/api/v1/attachments/${attachment.id}/content`,
        cookieValue,
      ),
      routeParams(attachment.id),
    );
    expect(ownResponse.status).toBe(200);
    expect(ownResponse.headers.get("x-content-type-options")).toBe("nosniff");

    const strangerResponse = await getAttachmentContent(
      buildGetRequest(
        `http://localhost:3000/api/v1/attachments/${attachment.id}/content`,
        strangerCookie,
      ),
      routeParams(attachment.id),
    );
    expect(strangerResponse.status).toBe(403);
  });

  it("lets the uploader delete a TEMPORARY attachment; deleting again 404s", async () => {
    const { cookieValue } = await makeAuthedUser("Attach Deleter");
    const buffer = await makeJpeg();

    const uploadResponse = await uploadAttachment(
      buildUploadRequest({
        url: "http://localhost:3000/api/v1/attachments",
        cookieValue,
        buffer,
        filename: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    );
    const attachment = (await uploadResponse.json()).data as { id: string };

    const deleteResponse = await deleteAttachment(
      buildJsonRequest({
        url: `http://localhost:3000/api/v1/attachments/${attachment.id}`,
        method: "DELETE",
        cookieValue,
      }),
      routeParams(attachment.id),
    );
    expect(deleteResponse.status).toBe(204);

    const secondDelete = await deleteAttachment(
      buildJsonRequest({
        url: `http://localhost:3000/api/v1/attachments/${attachment.id}`,
        method: "DELETE",
        cookieValue,
      }),
      routeParams(attachment.id),
    );
    expect(secondDelete.status).toBe(404);
  });

  it("a stranger cannot delete someone else's TEMPORARY attachment", async () => {
    const { cookieValue } = await makeAuthedUser("Attach Owner Two");
    const { cookieValue: strangerCookie } = await makeAuthedUser(
      "Attach Stranger Two",
    );
    const buffer = await makeJpeg();

    const uploadResponse = await uploadAttachment(
      buildUploadRequest({
        url: "http://localhost:3000/api/v1/attachments",
        cookieValue,
        buffer,
        filename: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    );
    const attachment = (await uploadResponse.json()).data as { id: string };

    const response = await deleteAttachment(
      buildJsonRequest({
        url: `http://localhost:3000/api/v1/attachments/${attachment.id}`,
        method: "DELETE",
        cookieValue: strangerCookie,
      }),
      routeParams(attachment.id),
    );
    expect(response.status).toBe(403);
  });

  it("binds an uploaded attachment to the frozen version on submit, and the creator can still read it once ATTACHED", async () => {
    const approver = await makeAuthedUser("Attach Submit Approver");
    const { cookieValue } = await makeAuthedUser("Attach Submit Creator");
    const { cookieValue: strangerCookie } = await makeAuthedUser(
      "Attach Submit Stranger",
    );

    const department = await prisma.department.create({
      data: { key: `attach-dept-${randomUUID()}`, name: "Attach Dept" },
    });
    const rule = await prisma.approvalRule.create({
      data: {
        name: `attach-rule-${randomUUID()}`,
        isActive: true,
        priorityOrder: 1,
        departmentId: department.id,
        targetType: "USER",
        targetUserId: approver.user.id,
      },
    });

    const createResponse = await createPost(
      buildJsonRequest({
        url: "http://localhost:3000/api/v1/posts",
        cookieValue,
        body: { title: "Post with media" },
      }),
    );
    const created = (await createResponse.json()).data as { id: string };
    createdPostIds.push(created.id);

    const buffer = await makeJpeg();
    const uploadResponse = await uploadAttachment(
      buildUploadRequest({
        url: "http://localhost:3000/api/v1/attachments",
        cookieValue,
        buffer,
        filename: "photo.jpg",
        mimeType: "image/jpeg",
      }),
    );
    const attachment = (await uploadResponse.json()).data as { id: string };

    const patchResponse = await patchPost(
      buildJsonRequest({
        url: `http://localhost:3000/api/v1/posts/${created.id}`,
        method: "PATCH",
        cookieValue,
        body: {
          lockVersion: 0,
          contentJson: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Body" }] },
            ],
          },
          departmentId: department.id,
          attachmentIds: [attachment.id],
        },
      }),
      routeParams(created.id),
    );
    expect(patchResponse.status).toBe(200);

    const submitResponse = await submitPostRoute(
      buildJsonRequest({
        url: `http://localhost:3000/api/v1/posts/${created.id}/submit`,
        cookieValue,
        body: { lockVersion: 1 },
      }),
      routeParams(created.id),
    );
    expect(submitResponse.status).toBe(200);

    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: attachment.id },
    });
    expect(stored.status).toBe("ATTACHED");
    expect(stored.attachedAt).not.toBeNull();

    const link = await prisma.postVersionAttachment.findFirstOrThrow({
      where: { attachmentId: attachment.id },
    });
    expect(link.position).toBe(0);

    const creatorRead = await getAttachmentContent(
      buildGetRequest(
        `http://localhost:3000/api/v1/attachments/${attachment.id}/content`,
        cookieValue,
      ),
      routeParams(attachment.id),
    );
    expect(creatorRead.status).toBe(200);

    const strangerRead = await getAttachmentContent(
      buildGetRequest(
        `http://localhost:3000/api/v1/attachments/${attachment.id}/content`,
        strangerCookie,
      ),
      routeParams(attachment.id),
    );
    expect(strangerRead.status).toBe(403);

    await prisma.approvalRule.delete({ where: { id: rule.id } });
    await prisma.department.delete({ where: { id: department.id } });
  });
});
