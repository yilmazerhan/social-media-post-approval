import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { getPostForEdit } from "@/modules/posts";
import { prisma } from "@/server/db";
import { config } from "@/server/config";
import { EditorScreen } from "@/components/app/editor/editor-screen";

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

  // The "can't edit" gate lives inside EditorScreen (checked once, from the
  // post's state as first loaded), not here — a router.refresh() right
  // after a successful submit re-runs this Server Component with
  // canEdit now false, and gating here would swap EditorScreen out for
  // an error view mid-render, discarding the submission-confirmation
  // state it had just set.
  return (
    <EditorScreen
      post={post}
      departments={departments}
      maxCharacters={config.POST_MAX_CHARACTERS}
      autosaveIntervalSeconds={config.AUTOSAVE_INTERVAL_SECONDS}
      maxAttachments={config.MAX_ATTACHMENTS_PER_POST}
      maxUploadSize={config.MAX_UPLOAD_SIZE}
      allowedAttachmentTypes={[
        ...config.ALLOWED_IMAGE_TYPES,
        ...config.ALLOWED_VIDEO_TYPES,
      ]}
    />
  );
}
