import { jsonResponse, readJson } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";
import type { EntityType } from "@/shared/messages";
import {
  queryExtractedEntities,
  getGoldenTableName
} from "../lib/table-helpers";

/**
 * POST /api/cluster/preview
 * Preview what a cluster merge would look like
 */
export async function previewCluster(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await readJson<{
    entity_type: EntityType;
    entity_ids: string[];
  }>(request);

  if (!body?.entity_type || !body.entity_ids || body.entity_ids.length < 2) {
    return jsonResponse(400, {
      error: "entity_type and at least 2 entity_ids are required"
    });
  }

  const sb = getServiceClient(env);

  // Fetch all entities to merge
  const { data: entities, error } = await queryExtractedEntities(
    sb,
    body.entity_type
  )
    .select("*")
    .in("id", body.entity_ids);

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  if (!entities || entities.length === 0) {
    return jsonResponse(404, { error: "No entities found" });
  }

  // Build preview: show all values for each field
  const preview: Record<
    string,
    Array<{ entity_id: string; value: unknown }>
  > = {};

  for (const entity of entities) {
    for (const [key, value] of Object.entries(entity)) {
      if (!preview[key]) {
        preview[key] = [];
      }
      if (value !== null && value !== undefined && "id" in entity) {
        preview[key].push({ entity_id: entity.id as string, value });
      }
    }
  }

  return jsonResponse(200, {
    entity_type: body.entity_type,
    entity_count: entities.length,
    entities: entities,
    field_preview: preview
  });
}

/**
 * POST /api/cluster/commit
 * Checkpoint 2: Create a cluster by grouping entities with field selections
 * Does NOT create golden record - that happens in checkpoint 3 (/api/golden/approve)
 */
export async function commitCluster(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await readJson<{
    entity_type: EntityType;
    entity_ids: string[];
    field_selections: Record<string, unknown>; // Curator's field choices
    merge_type?: "auto_similarity" | "manual_cluster";
  }>(request);

  if (
    !body?.entity_type ||
    !body.entity_ids ||
    body.entity_ids.length < 1 ||
    !body.field_selections
  ) {
    return jsonResponse(400, {
      error: "entity_type, entity_ids, and field_selections are required"
    });
  }

  const sb = getServiceClient(env);

  // Generate cluster_id using Web Crypto API
  const clusterId = crypto.randomUUID();

  // Update extracted entities with cluster_id
  const { error: updateError } = await queryExtractedEntities(
    sb,
    body.entity_type
  )
    .update({ cluster_id: clusterId })
    .in("id", body.entity_ids);

  if (updateError) {
    return jsonResponse(500, { error: updateError.message });
  }

  // Record cluster metadata in merge_history with pending_approval status
  const { error: historyError } = await sb.from("merge_history").insert({
    cluster_id: clusterId,
    entity_type: body.entity_type,
    merged_source_ids: body.entity_ids,
    merge_type: body.merge_type || "manual_cluster",
    field_selections: body.field_selections,
    approval_status: "pending_approval", // Track approval state
    created_at: new Date().toISOString()
  });

  if (historyError) {
    // Rollback cluster_id if history insert fails
    await queryExtractedEntities(sb, body.entity_type)
      .update({ cluster_id: null })
      .in("id", body.entity_ids);

    return jsonResponse(500, { error: historyError.message });
  }

  return jsonResponse(200, {
    cluster_id: clusterId,
    merged_count: body.entity_ids.length,
    status: "pending_approval",
    message: "Cluster created. Use /api/golden/approve to create golden record."
  });
}
