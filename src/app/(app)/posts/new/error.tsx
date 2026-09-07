"use client";

import { ErrorState } from "@/components/app/error-state";

/** Next.js route-level error boundary — UI_UX_SPEC.md §7's Error state. */
export default function CreatePostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      message="We couldn't start a new draft. Try again."
      traceId={error.digest}
      onRetry={reset}
    />
  );
}
