import { prisma } from "@/server/db";
import { protectedHandler } from "@/server/http/handler";
import { jsonError } from "@/server/http/envelope";
import { compareVersions } from "@/modules/posts";

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

/** `?from=&to=` — API.md's `/:id/versions/compare`. */
export const GET = protectedHandler<undefined, { creatorId: string }>(
  { permission: "POST_READ_OWN", loadResource: loadOwnedPost },
  async ({ request, params }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) {
      return {
        raw: jsonError(
          422,
          "VALIDATION_FAILED",
          "Both from and to are required.",
          [
            { field: "from", message: "Required." },
            { field: "to", message: "Required." },
          ],
        ),
      };
    }
    const comparison = await compareVersions(params.id, from, to);
    return { data: comparison };
  },
);
