/**
 * `npm run db:bootstrap` — production-safe. Ensures the baseline system
 * data exists (see bootstrap-system-data.ts) and creates the first ADMIN
 * account. Refuses to run again once any ADMIN-roled user exists.
 *
 * Non-interactive use (CI, provisioning scripts): set
 * BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (and optionally
 * BOOTSTRAP_ADMIN_NAME) to skip the prompts.
 */
import { createInterface } from "node:readline/promises";
import { prisma } from "@/server/db";
import { hashPassword, checkPasswordPolicy } from "@/modules/auth/local";
import { bootstrapSystemData } from "./lib/bootstrap-system-data";

const KEY_ENTER = 10; // \n
const KEY_CARRIAGE_RETURN = 13; // \r
const KEY_END_OF_TRANSMISSION = 4; // Ctrl+D
const KEY_INTERRUPT = 3; // Ctrl+C
const KEY_BACKSPACE = 127;

/** Reads one line from stdin without echoing it — for the password prompt. */
async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";

    const onData = (chunk: Buffer) => {
      const code = chunk.length > 0 ? chunk[0] : -1;

      if (
        code === KEY_ENTER ||
        code === KEY_CARRIAGE_RETURN ||
        code === KEY_END_OF_TRANSMISSION
      ) {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (code === KEY_INTERRUPT) {
        process.stdout.write("\n");
        process.exit(1);
      } else if (code === KEY_BACKSPACE) {
        value = value.slice(0, -1);
      } else {
        value += chunk.toString("utf8");
      }
    };

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  await bootstrapSystemData(prisma);

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { key: "ADMIN" },
  });
  const existingAdmin = await prisma.userRole.findFirst({
    where: { roleId: adminRole.id },
  });
  if (existingAdmin) {
    console.log(
      "An ADMIN user already exists — bootstrap has already run. Nothing to do.",
    );
    return;
  }

  let email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  let password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  let displayName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrator";

  if (!email || !password) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    if (!email) {
      email = (await rl.question("Admin email: ")).trim().toLowerCase();
    }
    displayName =
      (await rl.question(`Display name [${displayName}]: `)).trim() ||
      displayName;
    rl.close();
    if (!password) {
      password = await promptHidden("Admin password: ");
    }
  }

  const violations = checkPasswordPolicy(password, { email, displayName });
  if (violations.length > 0) {
    console.error("Password does not meet policy:");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const [firstName, ...rest] = displayName.split(" ").filter(Boolean);
  const lastName = rest.join(" ") || firstName || "Administrator";

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      firstName: firstName ?? "Administrator",
      lastName,
      authProvider: "LOCAL",
      passwordHash,
      passwordUpdatedAt: new Date(),
      status: "ACTIVE",
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: adminRole.id },
  });

  console.log(`Admin account created: ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
