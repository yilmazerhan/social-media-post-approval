"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersSection } from "./sections/users-section";
import { RolesSection } from "./sections/roles-section";
import { GroupsSection } from "./sections/groups-section";
import { DepartmentsSection } from "./sections/departments-section";
import { ApprovalRulesSection } from "./sections/approval-rules-section";
import { WorkflowSection } from "./sections/workflow-section";
import { SlaPoliciesSection } from "./sections/sla-policies-section";
import { EmailConfigSection } from "./sections/email-config-section";
import { EmailTemplatesSection } from "./sections/email-templates-section";
import { NotificationsSection } from "./sections/notifications-section";
import { RetentionSection } from "./sections/retention-section";
import { JobsSection } from "./sections/jobs-section";
import { AuditLogsSection } from "./sections/audit-logs-section";
import { SystemSettingsSection } from "./sections/system-settings-section";
import { TlsCertificateSection } from "./sections/tls-certificate-section";

/**
 * The permission keys this shell actually reads. Kept as a plain interface
 * (not the server-only `PermissionKey` union from `@/modules/authorization`,
 * which pulls in `@/server/db`) so this "use client" file never imports
 * server-only code — UI_UX_SPEC.md §1's "server truth": the page renders
 * only the sections and actions the server-computed grant set allows.
 */
export interface AdminGrants {
  USER_READ: boolean;
  USER_MANAGE: boolean;
  ROLE_MANAGE: boolean;
  GROUP_MANAGE: boolean;
  DEPARTMENT_MANAGE: boolean;
  SETTINGS_MANAGE: boolean;
  EMAIL_MANAGE: boolean;
  RETENTION_MANAGE: boolean;
  JOB_MANAGE: boolean;
  AUDIT_READ: boolean;
  CERTIFICATE_MANAGE: boolean;
}

interface SectionDef {
  value: string;
  label: string;
  visible: boolean;
  render: () => React.ReactNode;
}

/** UI_UX_SPEC.md §6's fourteen Administration sections, one consistent shell. */
export function AdminShell({ grants }: { grants: AdminGrants }) {
  const sections: SectionDef[] = [
    {
      value: "users",
      label: "Users",
      visible: grants.USER_READ,
      render: () => <UsersSection canManage={grants.USER_MANAGE} />,
    },
    {
      value: "roles",
      label: "Roles",
      visible: grants.ROLE_MANAGE,
      render: () => <RolesSection />,
    },
    {
      value: "groups",
      label: "Groups",
      visible: grants.GROUP_MANAGE,
      render: () => <GroupsSection />,
    },
    {
      value: "departments",
      label: "Departments",
      visible: grants.DEPARTMENT_MANAGE,
      render: () => <DepartmentsSection />,
    },
    {
      value: "approval-rules",
      label: "Approval rules",
      visible: grants.SETTINGS_MANAGE,
      render: () => <ApprovalRulesSection />,
    },
    {
      value: "workflow",
      label: "Workflow",
      visible: grants.SETTINGS_MANAGE,
      render: () => <WorkflowSection />,
    },
    {
      value: "sla-policies",
      label: "SLA policies",
      visible: grants.SETTINGS_MANAGE,
      render: () => <SlaPoliciesSection />,
    },
    {
      value: "email-config",
      label: "Email configuration",
      visible: grants.EMAIL_MANAGE,
      render: () => <EmailConfigSection />,
    },
    {
      value: "email-templates",
      label: "Email templates",
      visible: grants.EMAIL_MANAGE,
      render: () => <EmailTemplatesSection />,
    },
    {
      value: "notifications",
      label: "Notifications",
      visible: grants.SETTINGS_MANAGE,
      render: () => <NotificationsSection />,
    },
    {
      value: "retention",
      label: "Retention",
      visible: grants.RETENTION_MANAGE,
      render: () => <RetentionSection />,
    },
    {
      value: "jobs",
      label: "Background jobs",
      visible: grants.JOB_MANAGE,
      render: () => <JobsSection />,
    },
    {
      value: "audit-logs",
      label: "Audit logs",
      visible: grants.AUDIT_READ,
      render: () => <AuditLogsSection />,
    },
    {
      value: "system-settings",
      label: "System settings",
      visible: grants.SETTINGS_MANAGE,
      render: () => <SystemSettingsSection />,
    },
    {
      value: "tls-certificate",
      label: "TLS Certificate",
      visible: grants.CERTIFICATE_MANAGE,
      render: () => <TlsCertificateSection />,
    },
  ];

  const visibleSections = sections.filter((s) => s.visible);
  const [active, setActive] = useState(visibleSections[0]?.value ?? "");

  if (visibleSections.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You do not hold permission to manage any administration section.
      </p>
    );
  }

  return (
    <Tabs value={active} onValueChange={setActive}>
      <div className="flex flex-col gap-6 lg:flex-row">
        <TabsList className="h-auto w-full flex-row flex-wrap justify-start gap-1 bg-transparent p-0 lg:w-56 lg:flex-none lg:flex-col lg:items-stretch">
          {visibleSections.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="data-[state=active]:bg-muted w-full justify-start"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0 flex-1">
          {visibleSections.map((s) => (
            <TabsContent key={s.value} value={s.value} className="mt-0">
              {s.render()}
            </TabsContent>
          ))}
        </div>
      </div>
    </Tabs>
  );
}
