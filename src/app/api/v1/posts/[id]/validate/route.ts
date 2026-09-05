import { prisma } from "@/server/db";
import { protectedHandler } from "@/server/http/handler";
import { getReadiness } from "@/modules/posts";

export const GET = protectedHandler<undefined, { creatorId: string }>(
  {
    permission: "POST_READ_OWN",
    loadResource: async ({ params }) => {
      const post = await prisma.post.findUnique({
        where: { id: params.id },
        select: { creatorId: true },
      });
      if (!post) return null;
      return {
        resource: post,
        policyResource: { kind: "owned-post", creatorId: post.creatorId },
      };
    },
  },
  async ({ params }) => {
    const readiness = await getReadiness(params.id);
    return { data: readiness };
  },
);
