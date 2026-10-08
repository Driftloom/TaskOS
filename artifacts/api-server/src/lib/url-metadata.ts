/**
 * Extracted page metadata structure for URL attachments.
 */
export interface ExtractedUrlMetadata {
  /** The target URL resolved or requested */
  url: string;
  /** Human-readable page title resolved from Open Graph or HTML <title> */
  title: string;
  /** The host domain name (e.g., github.com) */
  domain: string;
}

/**
 * Validates whether a hostname points to a loopback, local subnet, private RFC 1918 range,
 * or cloud metadata service, protecting against Server-Side Request Forgery (SSRF).
 *
 * @param {string} hostname - The hostname to inspect.
 * @returns {boolean} True if the host is forbidden/private, false if public.
 */
export function isPrivateOrForbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "169.254.169.254"
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  return false;
}

/**
 * Decodes standard HTML entities into plain unicode characters.
 *
 * @param {string} str - Raw HTML entity string.
 * @returns {string} Clean decoded string.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

/**
 * Parses an HTML chunk to extract Open Graph title or standard `<title>` tag.
 *
 * @param {string} html - HTML text chunk (e.g. initial 64KB).
 * @param {string} originalUrl - The original URL used as a fallback title.
 * @returns {ExtractedUrlMetadata} Extracted metadata containing title, domain, and url.
 */
export function extractMetadataFromHtml(
  html: string,
  originalUrl: string,
): ExtractedUrlMetadata {
  let parsed: URL;
  try {
    parsed = new URL(originalUrl);
  } catch {
    return {
      url: originalUrl,
      title: originalUrl,
      domain: "",
    };
  }

  const domain = parsed.hostname;
  const fallbackTitle = `${domain}${parsed.pathname !== "/" ? parsed.pathname : ""}`;

  // 1. Try og:title
  const ogMatch =
    html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (ogMatch && ogMatch[1]?.trim()) {
    return {
      url: originalUrl,
      title: decodeHtmlEntities(ogMatch[1].trim()),
      domain,
    };
  }

  // 2. Try standard <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]?.trim()) {
    return {
      url: originalUrl,
      title: decodeHtmlEntities(titleMatch[1].trim()),
      domain,
    };
  }

  // 3. Fallback to domain and path
  return {
    url: originalUrl,
    title: fallbackTitle,
    domain,
  };
}

/**
 * Fetches and resolves page metadata for a public URL with SSRF protection and a 3.5s timeout.
 * Rejects private subnets, loopbacks, non-HTTP protocols, and excessive payloads.
 *
 * @param {string} rawUrl - The target URL string to resolve.
 * @returns {Promise<ExtractedUrlMetadata>} Resolves to extracted metadata or fallback domain/path title.
 * @throws {Error} If URL is syntactically invalid, protocol is unsupported, or target host is private/forbidden.
 */
export async function parseUrlMetadata(rawUrl: string): Promise<ExtractedUrlMetadata> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https protocols are supported");
  }

  if (isPrivateOrForbiddenHost(parsed.hostname)) {
    throw new Error("Requests to private or loopback addresses are forbidden");
  }

  try {
    const res = await fetch(rawUrl, {
      signal: AbortSignal.timeout(3500),
      headers: {
        "User-Agent": "Cadence/1.0 (+https://cadence.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) {
      return {
        url: rawUrl,
        title: `${parsed.hostname}${parsed.pathname !== "/" ? parsed.pathname : ""}`,
        domain: parsed.hostname,
      };
    }

    const text = await res.text();
    // Cap parsing at first 64KB
    const headChunk = text.slice(0, 65536);
    return extractMetadataFromHtml(headChunk, rawUrl);
  } catch {
    // Network or timeout failure fallback
    return {
      url: rawUrl,
      title: `${parsed.hostname}${parsed.pathname !== "/" ? parsed.pathname : ""}`,
      domain: parsed.hostname,
    };
  }
}
