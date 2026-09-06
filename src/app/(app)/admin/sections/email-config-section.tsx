"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/app/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  getJson,
  postJson,
} from "@/lib/api-client";

interface EmailSettingsDto {
  enabled: boolean;
  host: string;
  port: number;
  tls: string;
  fromAddress: string;
  replyTo: string | null;
  maxAttempts: number;
}

const testEmailFormSchema = z.object({
  to: z.string().email("Enter a valid email address."),
});
type TestEmailFormValues = z.infer<typeof testEmailFormSchema>;

/** Read-only: SMTP host/port/credentials stay env-only (CONFIGURATION.md) — there is no edit form here. */
export function EmailConfigSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<EmailSettingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await getJson<EmailSettingsDto>(
        "/api/v1/admin/email/settings",
      );
      setSettings(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const form = useForm<TestEmailFormValues>({
    resolver: zodResolver(testEmailFormSchema),
  });

  async function onSubmit(values: TestEmailFormValues) {
    try {
      await postJson(
        "/api/v1/admin/email/test",
        { to: values.to },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: `Test email queued to ${values.to}.` });
      form.reset();
    } catch (err) {
      toast({
        title:
          err instanceof ApiError ? err.message : "Couldn't send test email.",
        variant: "destructive",
      });
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Email configuration</h2>
      <Card>
        <CardHeader>
          <CardTitle>SMTP connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={settings.enabled ? "success" : "secondary"}>
              {settings.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Host</span>
            <span>
              {settings.host}:{settings.port}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">TLS</span>
            <span>{settings.tls}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">From address</span>
            <span>{settings.fromAddress}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Reply-to</span>
            <span>{settings.replyTo ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Max attempts</span>
            <span>{settings.maxAttempts}</span>
          </div>
          <p className="text-muted-foreground pt-2 text-xs">
            SMTP host, port and credentials are configured via environment
            variables and cannot be changed here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send a test email</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex items-end gap-2"
            noValidate
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="test-email-to">Send to</Label>
              <Input
                id="test-email-to"
                type="email"
                aria-invalid={!!form.formState.errors.to}
                {...form.register("to")}
              />
              {form.formState.errors.to && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.to.message}
                </p>
              )}
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Send test email
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
