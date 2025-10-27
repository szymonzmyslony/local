import { jsonResponse } from "@/shared/http";
import type { EntityType } from "@/shared/messages";

export async function getGoldenRecords(
  entityType: EntityType,
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "100";

  const endpoint = new URL(`http://golden/records/${entityType}`);
  endpoint.searchParams.set("limit", limit);

  const response = await env.GOLDEN.fetch(endpoint.toString(), { method: "GET" });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to fetch golden records",
      details: await response.text(),
    });
  }

  return response;
}
