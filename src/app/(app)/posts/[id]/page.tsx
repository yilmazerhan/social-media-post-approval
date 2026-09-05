import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import {
  getPostDetail,
  listVersions,
  getVersion,
  getActivity,
} from "@/modules/posts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { PostDetailsView } from "@/components/app/post-details/post-details-view";

export const metadata: Metadata = { title: "Post — Content Approval" };

export default async function PostDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  const post = await getPostDetail(id, sessionContext.user.id);
  if (!post) notFound();

  const versions = await listVersions(id);
  const latestVersion = versions[0]
    ? await getVersion(id, versions[0].id)
    : null;
  const activity = await getActivity(id);

  return (
    <div>
      <PageHeader
        title={post.title || "Untitled post"}
        breadcrumbs={[
          { label: "My Posts", href: "/posts" },
          { label: post.reference },
        ]}
        actions={
          post.capabilities.canEdit ? (
            <Button asChild>
              <Link href={`/posts/${post.id}/edit`}>Edit</Link>
            </Button>
          ) : undefined
        }
      />
      <PostDetailsView
        post={post}
        versions={versions}
        activity={activity}
        latestVersion={latestVersion}
      />
    </div>
  );
}
