import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { createDraft } from "@/modules/posts";

export const metadata: Metadata = { title: "Create post — Content Approval" };

/** Creates the DRAFT the moment this page is opened, then hands off to the real editor at a stable id — autosave needs a post to save against from the start. */
export default async function CreatePostPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  const { id } = await createDraft({
    creatorId: sessionContext.user.id,
    creatorEmail: sessionContext.user.email,
    input: {},
  });
  redirect(`/posts/${id}/edit`);
}
