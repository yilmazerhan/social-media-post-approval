"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ErrorState } from "@/components/app/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, getJson } from "@/lib/api-client";

interface VolumeRow {
  type: string;
  total: number;
  unread: number;
}

/** Read-only volume-by-type summary — per-user preferences remain the self-service /notifications page. */
export function NotificationsSection() {
  const [rows, setRows] = useState<VolumeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const data = await getJson<VolumeRow[]>(
        "/api/v1/admin/notifications-summary",
      );
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Notifications</h2>
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications have been sent yet." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Unread</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.type}>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{row.total}</TableCell>
                  <TableCell>{row.unread}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
