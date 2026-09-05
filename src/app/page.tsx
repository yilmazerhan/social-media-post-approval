import { ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldCheck className="text-primary size-10" aria-hidden />
      <h1 className="text-2xl font-semibold">Content Approval</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Internal content creation, versioning and approval platform. The
        application shell and screens are built out phase by phase — see
        IMPLEMENTATION_PLAN.md.
      </p>
    </main>
  );
}
