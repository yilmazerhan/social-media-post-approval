/**
 * `npm run db:seed` — development only. Refuses to run when
 * NODE_ENV=production. Idempotent: safe to run repeatedly.
 *
 * Creates the baseline system data (via bootstrapSystemData), four
 * departments, an approval group, three demo users, a department-scoped
 * approval rule, and the "Introducing Kron PAM 4.0" hero fixture that
 * makes the Post Editor and Approval Review screens demo-credible — see
 * DATABASE.md §10.
 */
import { randomBytes } from "node:crypto";
import { config } from "@/server/config";
import { prisma } from "@/server/db";
import { hashPassword } from "@/modules/auth/local";
import { bootstrapSystemData } from "./lib/bootstrap-system-data";
import { ensureHeroAttachmentFiles } from "./lib/seed-media";

const DEPARTMENTS = [
  { key: "marketing", name: "Marketing" },
  { key: "product", name: "Product" },
  { key: "engineering", name: "Engineering" },
  { key: "sales", name: "Sales" },
];

async function upsertDepartment(dept: { key: string; name: string }) {
  return prisma.department.upsert({
    where: { key: dept.key },
    create: { key: dept.key, name: dept.name },
    update: { name: dept.name },
  });
}

async function upsertLocalUser(input: {
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  departmentId?: string;
  passwordHash: string;
  roleKey: string;
}) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      displayName: input.displayName,
      firstName: input.firstName,
      lastName: input.lastName,
      departmentId: input.departmentId,
      authProvider: "LOCAL",
      passwordHash: input.passwordHash,
      passwordUpdatedAt: new Date(),
      status: "ACTIVE",
    },
    update: {
      displayName: input.displayName,
      departmentId: input.departmentId,
      // Reset on every run: these are throwaway dev accounts, and a fixed,
      // freshly-printed password is more useful than a stale one from a
      // previous run (or from db:bootstrap creating the same email first).
      passwordHash: input.passwordHash,
      passwordUpdatedAt: new Date(),
    },
  });

  const role = await prisma.role.findUniqueOrThrow({
    where: { key: input.roleKey },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });

  return user;
}

async function seedHeroPost(params: {
  creatorId: string;
  approverId: string;
  departmentId: string;
  ruleId: string;
}) {
  const reference = `POST-${new Date().getFullYear()}-000001`;
  const existing = await prisma.post.findUnique({ where: { reference } });
  if (existing) {
    // Self-heals a data/uploads wiped independently of the database (or
    // a first fix-forward run against a DB that already has the post).
    await ensureHeroAttachmentFiles(existing.id);

    // The hero post itself is created once — PostVersion rows are
    // immutable (ADR-006) and never rewritten on a later seed run. But
    // "due in 6h, warning already elapsed" was computed relative to
    // *that* run, not "now": left alone, a dev environment or long-lived
    // session eventually finds the fixture's SLA state has silently
    // drifted from "due soon" into "overdue" purely because real time
    // passed. Refreshing just the open assignment's due/warning window
    // (and the post's own mirrored dueAt) keeps the demo narrative true
    // without touching anything ADR-006 says must stay frozen.
    const openAssignment = await prisma.approvalAssignment.findFirst({
      where: {
        postId: existing.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    if (openAssignment) {
      const now = Date.now();
      const dueAt = new Date(now + 6 * 60 * 60 * 1000);
      const warningAt = new Date(now - 3 * 60 * 60 * 1000);
      await prisma.$transaction([
        prisma.post.update({ where: { id: existing.id }, data: { dueAt } }),
        prisma.approvalAssignment.update({
          where: { id: openAssignment.id },
          data: { dueAt, warningAt },
        }),
      ]);
      console.log(
        `Hero post ${reference} already exists — refreshed its due/warning window to stay "due in 6h".`,
      );
    } else {
      console.log(`Hero post ${reference} already exists — skipping.`);
    }
    return;
  }

  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);
  const hoursFromNow = (h: number) => new Date(now + h * 60 * 60 * 1000);

  const title = "Introducing Kron PAM 4.0";
  const bodyFor = (version: number) =>
    `<p>We are excited to announce <strong>Kron PAM 4.0</strong>, the latest release of our ` +
    `Privileged Access Management platform. This version brings faster session recording, ` +
    `a redesigned approval workflow, and expanded API coverage for enterprise integrations.</p>` +
    (version >= 3
      ? `<p>General availability is planned for this quarter, with existing customers upgraded automatically.</p>`
      : `<p>More details to follow soon.</p>`);
  const textFor = (version: number) =>
    `We are excited to announce Kron PAM 4.0, the latest release of our Privileged Access ` +
    `Management platform. This version brings faster session recording, a redesigned approval ` +
    `workflow, and expanded API coverage for enterprise integrations.` +
    (version >= 3
      ? ` General availability is planned for this quarter, with existing customers upgraded automatically.`
      : ` More details to follow soon.`);

  const post = await prisma.post.create({
    data: {
      reference,
      title,
      creatorId: params.creatorId,
      departmentId: params.departmentId,
      priority: "HIGH",
      status: "DRAFT",
      approvalRouteId: params.ruleId,
    },
  });

  async function createVersion(
    versionNumber: number,
    changeSummary: string | null,
    createdAt: Date,
  ) {
    const text = textFor(versionNumber);
    return prisma.postVersion.create({
      data: {
        postId: post.id,
        versionNumber,
        title,
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
        contentHtml: bodyFor(versionNumber),
        contentText: text,
        characterCount: text.length,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        createdById: params.creatorId,
        createdAt,
        submittedAt: createdAt,
        changeSummary,
      },
    });
  }

  const v1 = await createVersion(1, null, hoursAgo(72));
  const v2 = await createVersion(
    2,
    "Addressed first round of feedback.",
    hoursAgo(48),
  );
  const v3 = await createVersion(
    3,
    "Added GA timing and customer upgrade note.",
    hoursAgo(18),
  );

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status: "IN_REVIEW",
      currentVersionId: v3.id,
      submittedAt: hoursAgo(18),
      firstReviewedAt: hoursAgo(70),
      dueAt: hoursFromNow(6),
      lockVersion: { increment: 1 },
    },
  });

  await ensureHeroAttachmentFiles(post.id);

  const image = await prisma.attachment.create({
    data: {
      storageKey: `seed/${post.id}/hero-image.png`,
      originalFilename: "kron-pam-4-hero.png",
      sanitizedFilename: "kron-pam-4-hero.png",
      kind: "IMAGE",
      mimeType: "image/png",
      extension: "png",
      byteSize: 482_133,
      checksumSha256: randomBytes(32).toString("hex"),
      width: 1200,
      height: 630,
      thumbnailKey: `seed/${post.id}/hero-image-thumb.png`,
      status: "ATTACHED",
      uploadedById: params.creatorId,
      attachedAt: hoursAgo(18),
    },
  });

  const video = await prisma.attachment.create({
    data: {
      storageKey: `seed/${post.id}/hero-video.mp4`,
      originalFilename: "kron-pam-4-walkthrough.mp4",
      sanitizedFilename: "kron-pam-4-walkthrough.mp4",
      kind: "VIDEO",
      mimeType: "video/mp4",
      extension: "mp4",
      byteSize: 12_582_912,
      checksumSha256: randomBytes(32).toString("hex"),
      durationSeconds: 45,
      videoCodec: "h264",
      thumbnailKey: `seed/${post.id}/hero-video-thumb.png`,
      posterKey: `seed/${post.id}/hero-video-poster.png`,
      status: "ATTACHED",
      uploadedById: params.creatorId,
      attachedAt: hoursAgo(18),
    },
  });

  await prisma.postVersionAttachment.createMany({
    data: [
      { postVersionId: v3.id, attachmentId: image.id, position: 0 },
      { postVersionId: v3.id, attachmentId: video.id, position: 1 },
    ],
  });

  const priorAssignment = await prisma.approvalAssignment.create({
    data: {
      postId: post.id,
      postVersionId: v1.id,
      assigneeUserId: params.approverId,
      ruleId: params.ruleId,
      status: "COMPLETED",
      assignedAt: hoursAgo(72),
      startedAt: hoursAgo(70),
      completedAt: hoursAgo(68),
    },
  });
  const secondAssignment = await prisma.approvalAssignment.create({
    data: {
      postId: post.id,
      postVersionId: v2.id,
      assigneeUserId: params.approverId,
      ruleId: params.ruleId,
      status: "COMPLETED",
      assignedAt: hoursAgo(48),
      startedAt: hoursAgo(47),
      completedAt: hoursAgo(46),
    },
  });
  const openAssignment = await prisma.approvalAssignment.create({
    data: {
      postId: post.id,
      postVersionId: v3.id,
      assigneeUserId: params.approverId,
      ruleId: params.ruleId,
      status: "IN_PROGRESS",
      assignedAt: hoursAgo(18),
      startedAt: hoursAgo(17),
      dueAt: hoursFromNow(6),
      warningAt: hoursFromNow(-3),
    },
  });

  await prisma.approvalAction.createMany({
    data: [
      {
        postId: post.id,
        postVersionId: v1.id,
        assignmentId: priorAssignment.id,
        actorId: params.creatorId,
        action: "SUBMIT",
        previousStatus: "DRAFT",
        newStatus: "SUBMITTED",
        createdAt: hoursAgo(72),
      },
      {
        postId: post.id,
        postVersionId: v1.id,
        assignmentId: priorAssignment.id,
        actorId: params.approverId,
        action: "START_REVIEW",
        previousStatus: "SUBMITTED",
        newStatus: "IN_REVIEW",
        createdAt: hoursAgo(70),
      },
      {
        postId: post.id,
        postVersionId: v1.id,
        assignmentId: priorAssignment.id,
        actorId: params.approverId,
        action: "REQUEST_CHANGES",
        comment:
          "Please add the specific release date and tighten the second paragraph.",
        previousStatus: "IN_REVIEW",
        newStatus: "CHANGES_REQUESTED",
        createdAt: hoursAgo(68),
      },
      {
        postId: post.id,
        postVersionId: v2.id,
        assignmentId: secondAssignment.id,
        actorId: params.creatorId,
        action: "RESUBMIT",
        previousStatus: "CHANGES_REQUESTED",
        newStatus: "SUBMITTED",
        createdAt: hoursAgo(48),
      },
      {
        postId: post.id,
        postVersionId: v2.id,
        assignmentId: secondAssignment.id,
        actorId: params.approverId,
        action: "START_REVIEW",
        previousStatus: "SUBMITTED",
        newStatus: "IN_REVIEW",
        createdAt: hoursAgo(47),
      },
      {
        postId: post.id,
        postVersionId: v2.id,
        assignmentId: secondAssignment.id,
        actorId: params.approverId,
        action: "REQUEST_CHANGES",
        comment: "Tighten the second paragraph and add the release date.",
        previousStatus: "IN_REVIEW",
        newStatus: "CHANGES_REQUESTED",
        createdAt: hoursAgo(46),
      },
      {
        postId: post.id,
        postVersionId: v3.id,
        assignmentId: openAssignment.id,
        actorId: params.creatorId,
        action: "RESUBMIT",
        previousStatus: "CHANGES_REQUESTED",
        newStatus: "SUBMITTED",
        createdAt: hoursAgo(18),
      },
      {
        postId: post.id,
        postVersionId: v3.id,
        assignmentId: openAssignment.id,
        actorId: params.approverId,
        action: "START_REVIEW",
        previousStatus: "SUBMITTED",
        newStatus: "IN_REVIEW",
        createdAt: hoursAgo(17),
      },
    ],
  });

  console.log(
    `Seeded hero post ${reference} (v3, IN_REVIEW, due in 6h, waiting 18h).`,
  );
}

async function main() {
  if (config.NODE_ENV === "production") {
    console.error(
      "db:seed is a development-only command and refuses to run when NODE_ENV=production.",
    );
    process.exitCode = 1;
    return;
  }

  await bootstrapSystemData(prisma);

  const departments = new Map<
    string,
    Awaited<ReturnType<typeof upsertDepartment>>
  >();
  for (const dept of DEPARTMENTS) {
    departments.set(dept.key, await upsertDepartment(dept));
  }
  const marketing = departments.get("marketing");
  if (!marketing) {
    throw new Error(
      "Marketing department was not seeded — this should be unreachable.",
    );
  }

  const devPassword = `Dev-${randomBytes(9).toString("base64url")}!1`;
  const passwordHash = await hashPassword(devPassword);

  const john = await upsertLocalUser({
    email: "john.doe@example.local",
    displayName: "John Doe",
    firstName: "John",
    lastName: "Doe",
    departmentId: marketing.id,
    passwordHash,
    roleKey: "EMPLOYEE",
  });

  const jane = await upsertLocalUser({
    email: "jane.manager@example.local",
    displayName: "Jane Manager",
    firstName: "Jane",
    lastName: "Manager",
    departmentId: marketing.id,
    passwordHash,
    roleKey: "APPROVER",
  });

  await upsertLocalUser({
    email: "admin@example.local",
    displayName: "Admin",
    firstName: "Admin",
    lastName: "User",
    passwordHash,
    roleKey: "ADMIN",
  });

  await prisma.department.update({
    where: { id: marketing.id },
    data: { managerId: jane.id },
  });

  const approvalGroup = await prisma.group.upsert({
    where: { key: "marketing-approvers" },
    create: {
      key: "marketing-approvers",
      name: "Marketing Approvers",
      isApprovalGroup: true,
    },
    update: {},
  });
  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: jane.id, groupId: approvalGroup.id } },
    create: { userId: jane.id, groupId: approvalGroup.id },
    update: {},
  });

  const marketingRule = await prisma.approvalRule.findFirst({
    where: { name: "Marketing content" },
  });
  const rule =
    marketingRule ??
    (await prisma.approvalRule.create({
      data: {
        name: "Marketing content",
        description:
          "Marketing department posts route to the marketing approver.",
        isActive: true,
        priorityOrder: 10,
        departmentId: marketing.id,
        targetType: "USER",
        targetUserId: jane.id,
      },
    }));

  await seedHeroPost({
    creatorId: john.id,
    approverId: jane.id,
    departmentId: marketing.id,
    ruleId: rule.id,
  });

  console.log(
    "\nSeed complete. Demo accounts (development only, never use in production):",
  );
  console.log(`  john.doe@example.local    EMPLOYEE  password: ${devPassword}`);
  console.log(
    `  jane.manager@example.local APPROVER  password: ${devPassword}`,
  );
  console.log(
    `  admin@example.local        ADMIN     password: ${devPassword}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
