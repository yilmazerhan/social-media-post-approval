"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/app/error-state";

/**
 * Shared chrome for every report card — UI_UX_SPEC.md's "/reports" screen:
 * title, an "Export CSV" action, and loading/error states. Each report's own
 * table + chart is passed in as `children` since the data shape differs
 * per report.
 */
export function ReportCard({
  title,
  csvHref,
  loading,
  error,
  onRetry,
  children,
  className,
}: {
  title: string;
  csvHref: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <Button asChild variant="outline" size="sm">
          <a href={csvHref}>Export CSV</a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
