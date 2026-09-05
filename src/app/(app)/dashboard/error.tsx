"use client";

import { ErrorState } from "@/components/app/error-state";

/** Next.js route-level error boundary — UI_UX_SPEC.md §7's Error state. */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      message="We couldn't load your dashboard. Try again."
      onRetry={reset}
    />
  );
}
