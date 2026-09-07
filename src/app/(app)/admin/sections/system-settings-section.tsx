"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  getJson,
  patchJson,
} from "@/lib/api-client";

interface SystemSettingDto {
  key: string;
  value: string | null;
  type: string;
  category: string;
  description: string | null;
  isSecret: boolean;
}

export function SystemSettingsSection() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await getJson<SystemSettingDto[]>("/api/v1/admin/settings");
      setSettings(data);
      setDrafts(Object.fromEntries(data.map((s) => [s.key, s.value ?? ""])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(setting: SystemSettingDto) {
    setSavingKey(setting.key);
    try {
      const updated = await patchJson<SystemSettingDto>(
        `/api/v1/admin/settings/${setting.key}`,
        { value: drafts[setting.key] ?? "" },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Setting updated." });
      setSettings((prev) =>
        prev ? prev.map((s) => (s.key === updated.key ? updated : s)) : prev,
      );
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Couldn't save setting.",
        variant: "destructive",
      });
    } finally {
      setSavingKey(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings)
    return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">System settings</h2>
      {settings.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="No system settings are configured yet."
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((s) => (
                <TableRow key={s.key}>
                  <TableCell>
                    <div>{s.key}</div>
                    {s.description && (
                      <div className="text-muted-foreground text-xs">
                        {s.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{s.category}</TableCell>
                  <TableCell>
                    {s.isSecret ? (
                      <Badge variant="secondary">Secret — hidden</Badge>
                    ) : (
                      <Input
                        value={drafts[s.key] ?? ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [s.key]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!s.isSecret && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={savingKey === s.key}
                        onClick={() => handleSave(s)}
                      >
                        Save
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
