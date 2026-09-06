"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Mail, Plus, Trash2 } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  getJson,
  patchJson,
  postJson,
} from "@/lib/api-client";

interface EmailTemplateDto {
  key: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
}

interface PreviewResult {
  subject: string;
  body: string;
}

const templateFormSchema = z.object({
  name: z.string().min(1, "Required."),
  subjectTemplate: z.string().min(1, "Required."),
  bodyTemplate: z.string().min(1, "Required."),
});
type TemplateFormValues = z.infer<typeof templateFormSchema>;

export function EmailTemplatesSection() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplateDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editTemplate, setEditTemplate] = useState<EmailTemplateDto | null>(
    null,
  );
  const [editIsActive, setEditIsActive] = useState(true);

  const [previewVariables, setPreviewVariables] = useState<
    { key: string; value: string }[]
  >([{ key: "", value: "" }]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<EmailTemplateDto[]>(
        "/api/v1/admin/email/templates",
      );
      setTemplates(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const editForm = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
  });

  useEffect(() => {
    if (editTemplate) {
      editForm.reset({
        name: editTemplate.name,
        subjectTemplate: editTemplate.subjectTemplate,
        bodyTemplate: editTemplate.bodyTemplate,
      });
      setEditIsActive(editTemplate.isActive);
      setPreviewVariables([{ key: "", value: "" }]);
      setPreviewResult(null);
      setPreviewError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editForm identity is stable.
  }, [editTemplate]);

  async function onEditSubmit(values: TemplateFormValues) {
    if (!editTemplate) return;
    try {
      const updated = await patchJson<EmailTemplateDto>(
        `/api/v1/admin/email/templates/${editTemplate.key}`,
        {
          name: values.name,
          subjectTemplate: values.subjectTemplate,
          bodyTemplate: values.bodyTemplate,
          isActive: editIsActive,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Template updated." });
      setTemplates((prev) =>
        prev ? prev.map((t) => (t.key === updated.key ? updated : t)) : prev,
      );
      setEditTemplate(updated);
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't update template.",
        variant: "destructive",
      });
    }
  }

  async function handlePreview() {
    if (!editTemplate) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const variables: Record<string, string> = {};
      for (const row of previewVariables) {
        if (row.key.trim()) variables[row.key.trim()] = row.value;
      }
      const result = await postJson<PreviewResult>(
        `/api/v1/admin/email/templates/${editTemplate.key}/preview`,
        { variables },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      setPreviewResult(result);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError ? err.message : "Couldn't render preview.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  const columns: ColumnDef<EmailTemplateDto>[] = [
    {
      accessorKey: "name",
      header: "Template",
      cell: ({ row }) => (
        <button
          type="button"
          className="font-medium hover:underline"
          onClick={() => setEditTemplate(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: "key", header: "Key" },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!templates)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Email templates</h2>

      {templates.length === 0 ? (
        <EmptyState icon={Mail} title="No email templates yet." />
      ) : (
        <DataTable
          columns={columns}
          data={templates}
          emptyMessage="No templates."
        />
      )}

      <Sheet
        open={editTemplate !== null}
        onOpenChange={(o) => !o && setEditTemplate(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {editTemplate && (
            <>
              <SheetHeader>
                <SheetTitle>{editTemplate.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-4">
                <form
                  onSubmit={editForm.handleSubmit(onEditSubmit)}
                  className="space-y-4"
                  noValidate
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="template-name">Name</Label>
                    <Input id="template-name" {...editForm.register("name")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="template-subject">Subject</Label>
                    <Input
                      id="template-subject"
                      {...editForm.register("subjectTemplate")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="template-body">Body</Label>
                    <Textarea
                      id="template-body"
                      rows={8}
                      {...editForm.register("bodyTemplate")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="template-active" className="font-normal">
                      Active
                    </Label>
                    <Switch
                      id="template-active"
                      checked={editIsActive}
                      onCheckedChange={setEditIsActive}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={editForm.formState.isSubmitting}
                  >
                    Save changes
                  </Button>
                </form>

                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold">Preview</h3>
                  <p className="text-muted-foreground text-sm">
                    Render this template with sample variables.
                  </p>
                  {previewVariables.map((row, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="variable name"
                        value={row.key}
                        onChange={(e) =>
                          setPreviewVariables((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, key: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <Input
                        placeholder="value"
                        value={row.value}
                        onChange={(e) =>
                          setPreviewVariables((prev) =>
                            prev.map((r, i) =>
                              i === index ? { ...r, value: e.target.value } : r,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove variable"
                        onClick={() =>
                          setPreviewVariables((prev) =>
                            prev.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPreviewVariables((prev) => [
                        ...prev,
                        { key: "", value: "" },
                      ])
                    }
                  >
                    <Plus aria-hidden /> Add variable
                  </Button>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={previewLoading}
                      onClick={handlePreview}
                    >
                      Render preview
                    </Button>
                  </div>
                  {previewError && (
                    <p className="text-destructive text-sm">{previewError}</p>
                  )}
                  {previewResult && (
                    <div className="space-y-2 rounded-md border p-3 text-sm">
                      <p>
                        <span className="font-semibold">Subject: </span>
                        {previewResult.subject}
                      </p>
                      <div>
                        <span className="font-semibold">Body:</span>
                        {/* Shown as text, not rendered HTML — SECURITY.md
                        reserves `dangerouslySetInnerHTML` for sanitized post
                        HTML alone; an email template's own markup is trusted
                        admin content but isn't run through that sanitizer. */}
                        <pre className="bg-muted mt-1 max-w-none overflow-x-auto rounded-md p-2 whitespace-pre-wrap">
                          {previewResult.body}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
