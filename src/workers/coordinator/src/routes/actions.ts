import { jsonResponse } from "@/shared/http";
import type { EntityType } from "@/shared/messages";

export async function triggerExtraction(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const url = typeof body.url === "string" ? body.url : undefined;

  const endpoint = url
    ? new URL(`http://source/actions/trigger-extraction?url=${encodeURIComponent(url)}`)
    : new URL("http://source/actions/trigger-extraction");

  const method = url ? "POST" : "POST";
  const response = await env.SOURCE.fetch(endpoint.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    body: url ? JSON.stringify({ url }) : undefined,
  });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to trigger extraction",
      details: await response.text(),
    });
  }

  return response;
}

export async function materializeGolden(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json();
  const entityType = body?.entityType as EntityType | undefined;
  const entityId = body?.entityId as string | undefined;

  if (!entityType || !entityId) {
    return jsonResponse(400, { error: "entityType and entityId are required" });
  }

  const response = await env.GOLDEN.fetch("http://golden/materialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType, entityId }),
  });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to materialize golden record",
      details: await response.text(),
    });
  }

  return response;
}
