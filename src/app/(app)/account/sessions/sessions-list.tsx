"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MonitorSmartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import { ConfirmationDialog } from "@/components/app/confirmation-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ApiError,
  CSRF_COOKIE_NAME,
  deleteJson,
  getJson,
} from "@/lib/api-client";

interface SessionRow {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  authProvider: string;
  isCurrent: boolean;
}

export function SessionsList() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<SessionRow | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  async function load() {
    setError(null);
    try {
      const data = await getJson<SessionRow[]>("/api/v1/auth/sessions");
      setSessions(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await deleteJson(`/api/v1/auth/sessions/${revokeTarget.id}`, {
        csrfCookieName: CSRF_COOKIE_NAME,
      });
      setSessions(
        (prev) => prev?.filter((s) => s.id !== revokeTarget.id) ?? null,
      );
      toast({ title: "Session signed out." });
      setRevokeTarget(null);
    } catch (err) {
      toast({
        title: err instanceof ApiError ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setIsRevoking(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!sessions)
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (sessions.length === 0) {
    return <EmptyState icon={MonitorSmartphone} title="No active sessions." />;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>IP address</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead>Signed in via</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell className="max-w-xs truncate">
                {session.userAgent ?? "Unknown device"}
              </TableCell>
              <TableCell>{session.ipAddress ?? "—"}</TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(session.lastSeenAt), {
                  addSuffix: true,
                })}
                {session.isCurrent && (
                  <Badge variant="secondary" className="ml-2">
                    This device
                  </Badge>
                )}
              </TableCell>
              <TableCell>{session.authProvider}</TableCell>
              <TableCell className="text-right">
                {!session.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevokeTarget(session)}
                  >
                    Sign out
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmationDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Sign out this session?"
        description="This device will need to sign in again to continue."
        confirmLabel="Sign out"
        variant="destructive"
        isConfirming={isRevoking}
        onConfirm={handleRevoke}
      />
    </>
  );
}
