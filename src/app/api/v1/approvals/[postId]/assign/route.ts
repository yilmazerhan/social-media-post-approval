import { prisma } from "@/server/db";
import { protectedHandler } from "@/server/http/handler";
import { reassignSchema, reassignApproval } from "@/modules/approvals";

export const POST = protectedHandler<
  ReturnType<typeof reassignSchema.parse>,
  undefined
>(
  {
    schema: reassignSchema,
    permission: "APPROVAL_ASSIGN",
    loadResource: async ({ params }) => {
      const exists = await prisma.post.findUnique({
        where: { id: params.postId },
        select: { id: true },
      });
      if (!exists) return null;
      return { resource: undefined };
    },
  },
  async ({ params, user, input }) => {
    const result = await reassignApproval({
      postId: params.postId,
      actorId: user.id,
      input,
    });
    return { data: result };
  },
);
