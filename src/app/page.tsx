import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/server/http/request-context";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const sessionContext = await getServerSessionContext();
  if (sessionContext) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldCheck className="text-primary size-10" aria-hidden />
      <h1 className="text-2xl font-semibold">Content Approval</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Draft, review and approve social media and corporate content, with a
        clear record of every decision.
      </p>
      <Button asChild>
        <Link href="/login">Sign in</Link>
      </Button>
    </main>
  );
}
