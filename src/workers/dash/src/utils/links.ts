
import { z } from "zod";

/**
 * Cloudflare Browser Rendering /links
 * https://developers.cloudflare.com/browser-rendering/rest-api/links-endpoint/
 */

const responseSchema = z.object({
    success: z.boolean(),
    result: z.array(z.string()).optional()
});

export async function fetchLinks(CF_ACCOUNT_ID: string, CF_API_TOKEN: string, url: string): Promise<string[]> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/browser-rendering/links`;
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${CF_API_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error(`links API ${res.status}`);
    const json = responseSchema.parse(await res.json());
    if (!json.success) return [];
    return json.result ?? [];
}
