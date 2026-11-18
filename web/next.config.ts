import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The moment this build started, inlined into the bundle so the footer's
  // "Last updated" label names the build rather than the reader's today. The
  // same CI run pulls the processors' published output from S3 (see
  // .github/workflows/deploy.yaml), so this is when the data was pulled -- not
  // when the processors produced it, which can be earlier.
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  outputFileTracingExcludes: {
    "*": ["/pagefind/pagefind.js", "/pagefind/pagefind-highlight.js"],
  },
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
