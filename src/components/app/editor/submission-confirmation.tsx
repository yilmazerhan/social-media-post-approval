import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** UI_UX_SPEC.md §4's full-width `SubmissionConfirmation`. */
export function SubmissionConfirmation({
  reference,
  versionNumber,
  assigneeName,
  postId,
}: {
  reference: string;
  versionNumber: number;
  assigneeName: string | null;
  postId: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <CheckCircle2 className="text-success size-12" aria-hidden />
      <h1 className="text-xl font-semibold">
        Your post has been submitted for approval.
      </h1>
      <p className="text-muted-foreground">
        {reference} · Version {versionNumber}
        {assigneeName ? ` · Assigned to ${assigneeName}` : ""} · Status:
        Submitted
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href={`/posts/${postId}`}>View post</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/posts">Back to My Posts</Link>
        </Button>
      </div>
    </div>
  );
}
