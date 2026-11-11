import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

/**
 * Workers transport for Client ID Metadata Documents (how Claude or ChatGPT identify themselves
 * with a URL such as https://claude.ai/oauth/mcp-oauth-client-metadata).
 *
 * The Node transport in @better-auth/cimd pins DNS to block requests into private networks; a
 * Worker's fetch cannot reach private networks at all, so this enforces the rest of the contract:
 * HTTPS, GET/HEAD, public hostnames, and redirects handed back instead of followed.
 *
 * Only method, headers and signal are forwarded: the plugin asks for `redirect: "error"`, which
 * Workers' fetch does not support (only "follow" | "manual") and would throw on. A 3xx comes back
 * as a response and the plugin rejects it, so redirects are still never followed.
 */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (
  input,
  init,
) => {
  const source =
    typeof input === "object" && "method" in input ? input : undefined;
  const url = new URL(
    typeof input === "string"
      ? input
      : source
        ? source.url
        : (input as URL).href,
  );
  const method = (init?.method ?? source?.method ?? "GET").toUpperCase();
  if (url.protocol !== "https:")
    throw new TypeError("CIMD requires an HTTPS URL");
  if (method !== "GET" && method !== "HEAD") {
    throw new TypeError("CIMD supports only GET and HEAD");
  }
  if (
    /^\[|^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) ||
    url.hostname === "localhost"
  ) {
    throw new TypeError("CIMD metadata must be served from a public hostname");
  }
  return fetch(url, {
    method,
    headers: init?.headers ?? source?.headers,
    signal: init?.signal ?? source?.signal,
    redirect: "manual",
  });
};
