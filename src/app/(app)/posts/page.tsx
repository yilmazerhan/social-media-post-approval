import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { PostsView } from "@/components/app/posts/posts-view";

export const metadata: Metadata = { title: "My Posts — Content Approval" };

export default async function PostsPage() {
  const sessionContext = await getServerSessionContext();
  if (!sessionContext) redirect("/login");

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="My Posts" breadcrumbs={[{ label: "My Posts" }]} />
      <Suspense>
        <PostsView departments={departments} />
      </Suspense>
    </div>
  );
}
