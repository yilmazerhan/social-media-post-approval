import type { Metadata } from "next";
import { config } from "@/server/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Content Approval" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Content Approval</h1>
          <p className="text-muted-foreground text-sm">Sign in to continue</p>
        </div>
        <LoginForm samlEnabled={config.AUTH_SAML_ENABLED} />
      </div>
    </main>
  );
}
