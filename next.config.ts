import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Media/upload-pipeline libraries (ARCHITECTURE.md §6) do runtime
  // module resolution (native bindings, dynamic requires) that the
  // bundler can't statically analyze — "Cannot find module as expression
  // is too dynamic" if left to Turbopack/webpack. Excluding them from the
  // server bundle and letting Node `require` them directly at runtime is
  // Next.js's documented fix.
  serverExternalPackages: ["sharp", "file-type", "busboy"],
};

export default nextConfig;
