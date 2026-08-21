import type { GallerySource } from "./schemas";
import { sha256 } from "./url";

const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_EXTRACTION_CHARS = 90_000;

export function prepareContentForExtraction(content: string): string {
  return content
    .replace(
      /data:image\/[a-z0-9.+-]+(?:;charset=[^;,\s)]+)?;base64,[a-z0-9+/=]+/gi,
      "[inline image omitted]"
    )
    .slice(0, MAX_EXTRACTION_CHARS)
    .trim();
}

async function readLimited(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
  truncate = false
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength > maxBytes) {
      const remaining = Math.max(0, maxBytes - total);
      if (truncate && remaining > 0) {
        chunks.push(value.slice(0, remaining));
        total += remaining;
      }
      await reader.cancel("response exceeded observer limit");
      if (truncate) break;
      throw new Error(`Source response exceeded ${maxBytes} bytes`);
    }
    total += value.byteLength;
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

type BrowserMarkdownResponse = {
  success: boolean;
  result?: string;
  errors?: Array<{ message: string }>;
};

export type FetchedSnapshot = {
  content: string;
  contentHash: string;
  contentType: string;
  httpStatus: number;
  strategy: GallerySource["strategy"];
  browserMs: number | null;
  byteLength: number;
};

async function browserMarkdown(
  browser: BrowserRun,
  url: string
): Promise<FetchedSnapshot> {
  const response = await browser.quickAction("markdown", {
    url,
    gotoOptions: { waitUntil: "networkidle2", timeout: 45_000 },
    actionTimeout: 60_000,
    bestAttempt: true,
    cacheTTL: 0,
    rejectResourceTypes: ["image", "media", "font", "websocket"]
  });
  const body = await readLimited(response);
  let payload: BrowserMarkdownResponse;
  try {
    payload = JSON.parse(body) as BrowserMarkdownResponse;
  } catch {
    throw new Error(`Browser Run returned non-JSON (${response.status})`);
  }
  if (!response.ok || !payload.success || typeof payload.result !== "string") {
    const detail =
      payload.errors?.map((entry) => entry.message).join("; ") ||
      response.statusText;
    throw new Error(
      `Browser Run markdown failed (${response.status}): ${detail}`
    );
  }
  const content = payload.result.slice(0, MAX_EXTRACTION_CHARS);
  const browserMs = Number(response.headers.get("x-browser-ms-used"));
  return {
    content,
    contentHash: await sha256(content),
    contentType: "text/markdown",
    httpStatus: 200,
    strategy: "browser_markdown",
    browserMs:
      Number.isFinite(browserMs) && browserMs > 0
        ? Math.round(browserMs)
        : null,
    byteLength: new TextEncoder().encode(content).byteLength
  };
}

async function httpHtml(url: string): Promise<FetchedSnapshot> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
      "user-agent": "ZineObserver/1.0 (+https://zinelocal.com)"
    },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`HTTP fetch failed (${response.status})`);
  const contentType =
    response.headers.get("content-type")?.split(";")[0] ?? "text/plain";
  if (!/^(text\/|application\/xhtml\+xml)/.test(contentType)) {
    throw new Error(`Unsupported source content type: ${contentType}`);
  }
  // Raw HTML can be safely truncated before extraction. Browser Run returns a
  // JSON envelope, which must remain complete and therefore stays strict.
  const content = (await readLimited(response, MAX_RESPONSE_BYTES, true)).slice(
    0,
    MAX_EXTRACTION_CHARS
  );
  return {
    content,
    contentHash: await sha256(content),
    contentType,
    httpStatus: response.status,
    strategy: "http_html",
    browserMs: null,
    byteLength: new TextEncoder().encode(content).byteLength
  };
}

export async function fetchSource(browser: BrowserRun, source: GallerySource) {
  if (source.strategy === "http_html") return httpHtml(source.normalizedUrl);
  try {
    return await browserMarkdown(browser, source.normalizedUrl);
  } catch (browserError) {
    try {
      const snapshot = await httpHtml(source.normalizedUrl);
      console.warn(
        JSON.stringify({
          event: "browser_markdown_http_fallback",
          source: source.normalizedUrl,
          browserError:
            browserError instanceof Error
              ? browserError.message
              : String(browserError)
        })
      );
      return snapshot;
    } catch (httpError) {
      throw new Error(
        `Browser Rendering failed: ${browserError instanceof Error ? browserError.message : String(browserError)}; HTTP fallback failed: ${httpError instanceof Error ? httpError.message : String(httpError)}`
      );
    }
  }
}

export async function browserLinks(
  browser: BrowserRun,
  url: string
): Promise<string[]> {
  try {
    const response = await browser.quickAction("links", {
      url,
      visibleLinksOnly: false,
      excludeExternalLinks: true,
      gotoOptions: { waitUntil: "domcontentloaded", timeout: 30_000 },
      actionTimeout: 45_000,
      bestAttempt: true,
      cacheTTL: 300,
      rejectResourceTypes: ["image", "media", "font", "websocket"]
    });
    const body = await readLimited(response);
    const payload = JSON.parse(body) as {
      success: boolean;
      result?: string[];
      errors?: Array<{ message: string }>;
    };
    if (!response.ok || !payload.success) {
      throw new Error(
        payload.errors?.map((entry) => entry.message).join("; ") ||
          "link fetch failed"
      );
    }
    return (payload.result ?? []).slice(0, 500);
  } catch (browserError) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "ZineObserver/1.0 (+https://zinelocal.com)"
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        throw new Error(`HTTP link fetch failed (${response.status})`);
      }
      const html = await readLimited(response, 1_000_000, true);
      const links = extractHtmlLinks(html, response.url || url);
      console.warn(
        JSON.stringify({
          event: "browser_links_http_fallback",
          source: url,
          browserError:
            browserError instanceof Error
              ? browserError.message
              : String(browserError),
          links: links.length
        })
      );
      return links;
    } catch (httpError) {
      throw new Error(
        `Browser link discovery failed: ${browserError instanceof Error ? browserError.message : String(browserError)}; HTTP fallback failed: ${httpError instanceof Error ? httpError.message : String(httpError)}`
      );
    }
  }
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|amp|quot|apos|lt|gt);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
      if (hexadecimal)
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      const named: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">"
      };
      return named[entity.toLowerCase()] ?? entity;
    }
  );
}

export function extractHtmlLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  const pattern =
    /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  for (const match of html.matchAll(pattern)) {
    const href = decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
    if (!href || href.startsWith("#")) continue;
    try {
      const resolved = new URL(href, base);
      if (
        resolved.origin !== base.origin ||
        !["http:", "https:"].includes(resolved.protocol)
      ) {
        continue;
      }
      resolved.hash = "";
      links.add(resolved.toString());
      if (links.size >= 500) break;
    } catch {
      // Malformed navigation entries are advisory and can be skipped.
    }
  }
  return [...links];
}

export async function fetchDiscoveryHtml(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "ZineMarketScout/1.0 (+https://zinelocal.com)"
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (response.ok) return readLimited(response, 1_000_000);

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 3) {
      throw new Error(`Directory fetch failed (${response.status})`);
    }
    await response.body?.cancel("retrying rate-limited directory request");
    const retryAfter = Number(response.headers.get("retry-after"));
    const random = new Uint16Array(1);
    crypto.getRandomValues(random);
    const jitterMs = (random[0] ?? 0) % 250;
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1_000, 15_000)
      : Math.min(750 * 2 ** attempt + jitterMs, 8_000);
    if (typeof scheduler !== "undefined") {
      await scheduler.wait(delayMs);
    } else {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Directory fetch exhausted retries");
}

export function selectProfileSourceUrls(
  links: string[],
  officialUrl: string
): string[] {
  const origin = new URL(officialUrl).origin;
  const scores = new Map<string, number>();
  for (const value of links) {
    try {
      const url = new URL(value, officialUrl);
      if (url.origin !== origin || url.protocol !== "https:") continue;
      url.hash = "";
      const text = `${url.pathname} ${url.search}`.toLowerCase();
      if (/privacy|terms|press|shop|login|event|exhibition|archive/.test(text)) {
        continue;
      }
      const score = /opening|hours/.test(text)
        ? 100
        : /visit|plan-your-visit/.test(text)
          ? 90
          : /find-us|location/.test(text)
            ? 85
            : /contact/.test(text)
              ? 75
              : /about/.test(text)
                ? 60
                : 0;
      if (score === 0) continue;
      const normalized = url.toString();
      scores.set(normalized, Math.max(score, scores.get(normalized) ?? 0));
    } catch {
      // Navigation link discovery is advisory.
    }
  }
  return [...scores]
    .sort(
      ([leftUrl, leftScore], [rightUrl, rightScore]) =>
        rightScore - leftScore || leftUrl.localeCompare(rightUrl)
    )
    .slice(0, 3)
    .map(([url]) => url);
}
