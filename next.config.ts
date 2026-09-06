import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Media/upload-pipeline libraries (ARCHITECTURE.md §6) do runtime
  // module resolution (native bindings, dynamic requires) that the
  // bundler can't statically analyze — "Cannot find module as expression
  // is too dynamic" if left to Turbopack/webpack. Excluding them from the
  // server bundle and letting Node `require` them directly at runtime is
  // Next.js's documented fix.
  serverExternalPackages: ["sharp", "file-type", "busboy"],
  // DEPLOYMENT.md §3 — the runtime image ships only the traced standalone
  // output (`.next/standalone` + `.next/static` + `public/`), not the full
  // `node_modules`/build toolchain.
  output: "standalone",
  // Dev-only indicator; stripped entirely from production builds. Left at
  // its default it renders at the viewport's top-left corner (at least in
  // this Next.js version) — directly on top of the app shell's own
  // top-left "Open navigation" button below the tablet breakpoint, which
  // made it swallow every click meant for that button
  // (tests/e2e/shell.spec.ts's tablet drawer test). Nothing in this app's
  // UI lives in the bottom-right corner (toasts are top-right per
  // UI_UX_SPEC.md §7), so that's where this goes instead.
  devIndicators: false,
};

export default nextConfig;
