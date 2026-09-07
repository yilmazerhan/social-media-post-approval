import type { UserStatus } from "@/generated/prisma/client";
import {
  listUsers,
  createUser,
  createUserSchema,
} from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

const USER_STATUSES: readonly UserStatus[] = [
  "ACTIVE",
  "DISABLED",
  "LOCKED",
  "PENDING",
];

export const GET = protectedHandler(
  { permission: "USER_READ" },
  async ({ request }) => {
    const params = new URL(request.url).searchParams;
    const statusParam = params.get("status");
    const status =
      statusParam && (USER_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as UserStatus)
        : undefined;
    const page = Number(params.get("page") ?? "1");
    const pageSize = Number(params.get("pageSize") ?? "20");

    const result = await listUsers({
      q: params.get("q") ?? undefined,
      status,
      departmentId: params.get("departmentId") ?? undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20,
    });
    return {
      data: result.items,
      meta: { page: 1, pageSize: result.items.length, total: result.total },
    };
  },
);

export const POST = protectedHandler<
  ReturnType<typeof createUserSchema.parse>,
  undefined
>(
  { schema: createUserSchema, permission: "USER_MANAGE" },
  async ({ input, user }) => {
    const created = await createUser(input, user.id);
    return { data: created, status: 201 };
  },
);
