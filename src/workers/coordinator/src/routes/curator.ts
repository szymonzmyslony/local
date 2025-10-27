import { jsonResponse, readJson } from "@/shared/http";
import type { EntityType } from "@/shared/messages";

interface CuratorMergeRequest {
  linkId: string;
  winnerId: string;
  loserId: string;
  entityType: EntityType;
  notes?: string;
}

interface CuratorDismissRequest {
  linkId: string;
  notes?: string;
}

export async function getCuratorQueue(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") as EntityType | null;
  const limit = url.searchParams.get("limit") ?? "50";

  const endpoint = new URL("http://identity/curator/queue");
  endpoint.searchParams.set("limit", limit);
  if (entityType) {
    endpoint.searchParams.set("entityType", entityType);
  }

  const response = await env.IDENTITY.fetch(endpoint.toString(), { method: "GET" });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to fetch curator queue",
      details: await response.text(),
    });
  }

  return response;
}

export async function mergeEntities(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await readJson<CuratorMergeRequest>(request);

  if (!body?.linkId || !body?.winnerId || !body?.loserId) {
    return jsonResponse(400, {
      error: "linkId, winnerId, and loserId are required",
    });
  }

  const response = await env.IDENTITY.fetch("http://identity/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_type: body.entityType,
      winner_id: body.winnerId,
      loser_id: body.loserId,
      link_id: body.linkId,
      notes: body.notes,
    }),
  });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to merge entities",
      details: await response.text(),
    });
  }

  return response;
}

export async function dismissLink(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await readJson<CuratorDismissRequest>(request);

  if (!body?.linkId) {
    return jsonResponse(400, { error: "linkId is required" });
  }

  const response = await env.IDENTITY.fetch("http://identity/dismiss", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      link_id: body.linkId,
      notes: body.notes,
    }),
  });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to dismiss link",
      details: await response.text(),
    });
  }

  return response;
}
