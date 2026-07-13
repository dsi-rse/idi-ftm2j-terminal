import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
	// Serve the prerendered pages (generateStaticParams for /companies/[id])
	// from Workers static assets. Required because those routes are
	// `force-static` + `dynamicParams = false`: without an incremental cache the
	// worker cannot retrieve them and every company page 404s. The site has no
	// ISR/revalidation, so the read-only static-assets cache is the right fit.
	// `opennextjs-cloudflare deploy` populates it automatically.
	incrementalCache: staticAssetsIncrementalCache,
});
