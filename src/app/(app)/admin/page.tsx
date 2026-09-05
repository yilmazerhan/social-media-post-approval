import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata: Metadata = {
  title: "Administration — Content Approval",
};

export default function AdminPage() {
  return (
    <ComingSoon
      title="Administration"
      breadcrumbs={[{ label: "Administration" }]}
      phaseNote="Users, roles, groups, departments, approval rules and system settings arrive in Phase 21."
    />
  );
}
