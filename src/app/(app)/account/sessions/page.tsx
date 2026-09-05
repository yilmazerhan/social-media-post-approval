import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { SessionsList } from "./sessions-list";

export const metadata: Metadata = { title: "Sessions — Content Approval" };

export default function SessionsPage() {
  return (
    <div>
      <PageHeader title="Sessions" breadcrumbs={[{ label: "Sessions" }]} />
      <SessionsList />
    </div>
  );
}
