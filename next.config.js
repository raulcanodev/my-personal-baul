import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import("next").NextConfig} */
const config = {
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
};

export default config;

// Gives `next dev` the Worker bindings (local D1 under .wrangler/) through getCloudflareContext()
initOpenNextCloudflareForDev();
