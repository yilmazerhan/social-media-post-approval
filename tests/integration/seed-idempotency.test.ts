import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";

/**
 * DATABASE.md §10: "Seed data is idempotent". Runs the real `db:seed`
 * script twice as a subprocess against the test database and checks that
 * the second run changes nothing — no duplicate hero post, no doubled
 * system-data rows.
 */

const seedEntry = path.resolve(__dirname, "../../prisma/seed.ts");
const tsxBin = path.resolve(__dirname, "../../node_modules/.bin/tsx");

function runSeed() {
  return spawnSync(tsxBin, [seedEntry], {
    env: process.env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

async function snapshotCounts() {
  const [
    posts,
    versions,
    actions,
    permissions,
    roles,
    slaPolicies,
    retentionPolicies,
    emailTemplates,
    jobSchedules,
    users,
  ] = await Promise.all([
    prisma.post.count(),
    prisma.postVersion.count(),
    prisma.approvalAction.count(),
    prisma.permission.count(),
    prisma.role.count(),
    prisma.slaPolicy.count(),
    prisma.retentionPolicy.count(),
    prisma.emailTemplate.count(),
    prisma.jobSchedule.count(),
    prisma.user.count({ where: { email: { endsWith: "@example.local" } } }),
  ]);
  return {
    posts,
    versions,
    actions,
    permissions,
    roles,
    slaPolicies,
    retentionPolicies,
    emailTemplates,
    jobSchedules,
    users,
  };
}

describe("db:seed idempotency", () => {
  beforeAll(() => {
    const first = runSeed();
    expect(first.status, first.stderr).toBe(0);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("running it again does not change row counts", async () => {
    const before = await snapshotCounts();

    const second = runSeed();
    expect(second.status, second.stderr).toBe(0);

    const after = await snapshotCounts();
    expect(after).toEqual(before);
  });

  it("creates exactly one hero post", async () => {
    const posts = await prisma.post.findMany({
      where: { reference: { startsWith: "POST-" } },
    });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe("Introducing Kron PAM 4.0");
  });

  it("the demo accounts can authenticate with the printed password", async () => {
    // The password is regenerated per run and printed to stdout — re-run
    // once more here so we have both the hash and the matching plaintext.
    const { verifyPassword } = await import("@/modules/auth/local");
    const run = runSeed();
    expect(run.status, run.stderr).toBe(0);
    const match = run.stdout.match(
      /john\.doe@example\.local\s+EMPLOYEE\s+password:\s+(\S+)/,
    );
    expect(match).not.toBeNull();

    const john = await prisma.user.findUniqueOrThrow({
      where: { email: "john.doe@example.local" },
    });
    expect(john.passwordHash).not.toBeNull();
    const ok = await verifyPassword(
      john.passwordHash as string,
      match?.[1] ?? "",
    );
    expect(ok).toBe(true);
  });
});
