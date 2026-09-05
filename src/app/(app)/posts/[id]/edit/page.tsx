import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { getPostForEdit } from "@/modules/posts";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { EditorScreen } from "@/components/app/editor/editor-screen";
import { ErrorState } from "@/components/app/error-state";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Edit post — Content Approval" };

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  const [post, departments] = await Promise.all([
    getPostForEdit(id, sessionContext.user.id),
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!post) notFound();

  if (!post.capabilities.canEdit) {
    return (
      <div>
        <PageHeader
          title="Edit post"
          breadcrumbs={[
            { label: "My Posts", href: "/posts" },
            { label: "Edit" },
          ]}
        />
        <ErrorState message="This post can't be edited — it isn't yours, or it's already past the draft stage." />
      </div>
    );
  }

  return (
    <EditorScreen
      post={post}
      departments={departments}
      maxCharacters={config.POST_MAX_CHARACTERS}
      autosaveIntervalSeconds={config.AUTOSAVE_INTERVAL_SECONDS}
    />
  );
}
