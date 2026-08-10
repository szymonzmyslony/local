
const MAX_BROWSER_RESPONSE_BYTES = 2_000_000;
type BrowserBinding = Pick<BrowserRun, "quickAction">;

export async function readBrowserJson<T>(response: Response): Promise<T> {
    if (!response.body) throw new Error("Browser Run returned an empty response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > MAX_BROWSER_RESPONSE_BYTES) {
            await reader.cancel("response too large");
            throw new Error("Browser Run response exceeded 2 MB");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function fetchLinks(browser: BrowserBinding, url: string): Promise<string[]> {
    const response = await browser.quickAction("links", {
        url,
        visibleLinksOnly: true,
        excludeExternalLinks: true,
        gotoOptions: { waitUntil: "domcontentloaded", timeout: 30_000 },
        actionTimeout: 45_000,
        bestAttempt: true,
        rejectResourceTypes: ["image", "media", "font", "websocket"]
    });
    const payload = await readBrowserJson<{
        success: boolean;
        result?: string[];
        errors?: Array<{ message: string }>;
    }>(response);
    if (!response.ok || !payload.success) {
        throw new Error(payload.errors?.map((entry) => entry.message).join("; ") || `links action ${response.status}`);
    }
    return payload.result ?? [];
}

export async function fetchMarkdown(browser: BrowserBinding, url: string): Promise<string> {
    const response = await browser.quickAction("markdown", {
        url,
        gotoOptions: { waitUntil: "networkidle2", timeout: 45_000 },
        actionTimeout: 60_000,
        bestAttempt: true,
        cacheTTL: 0,
        rejectResourceTypes: ["image", "media", "font", "websocket"]
    });
    const payload = await readBrowserJson<{
        success: boolean;
        result?: string;
        errors?: Array<{ message: string }>;
    }>(response);
    if (!response.ok || !payload.success || typeof payload.result !== "string") {
        throw new Error(payload.errors?.map((entry) => entry.message).join("; ") || `markdown action ${response.status}`);
    }
    return payload.result.slice(0, 100_000);
}
