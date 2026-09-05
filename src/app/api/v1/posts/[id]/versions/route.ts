import { prisma } from "@/server/db";
import { protectedHandler } from "@/server/http/handler";
import { listVersions } from "@/modules/posts";

async function loadOwnedPost({ params }: { params: Record<string, string> }) {
  const post = await prisma.post.findUnique({
    where: { id: params.id },
    select: { creatorId: true },
  });
  if (!post) return null;
  return {
    resource: post,
    policyResource: { kind: "owned-post" as const, creatorId: post.creatorId },
  };
}

export const GET = protectedHandler<undefined, { creatorId: string }>(
  { permission: "POST_READ_OWN", loadResource: loadOwnedPost },
  async ({ params }) => {
    const versions = await listVersions(params.id);
    return { data: versions };
  },
);
