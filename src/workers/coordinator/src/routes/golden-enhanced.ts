import { jsonResponse, readJson } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";
import type { EntityType } from "@/shared/messages";
import { getGoldenTableName, queryGoldenEntities } from "../lib/table-helpers";

export async function getGoldenEntities(
	entityType: "artists" | "galleries" | "events",
	request: Request,
	env: Env
): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const offset = parseInt(url.searchParams.get("offset") || "0");

	const sb = getServiceClient(env);

	// Map plural to singular EntityType
	const singularEntityType: EntityType = entityType === "artists" ? "artist" : entityType === "galleries" ? "gallery" : "event";

	const { data, error, count } = await queryGoldenEntities(sb, singularEntityType)
		.select("*", { count: "exact" })
		.order("updated_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	return jsonResponse(200, {
		records: data || [],
		total: count || 0,
	});
}

/**
 * POST /api/golden/approve
 * Checkpoint 3: Approve a cluster and create golden entity
 */
export async function approveCluster(
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{
		cluster_id: string;
	}>(request);

	if (!body?.cluster_id) {
		return jsonResponse(400, {
			error: "cluster_id is required",
		});
	}

	const sb = getServiceClient(env);

	// Get cluster metadata from merge_history
	const { data: clusterData, error: clusterError } = await sb
		.from("merge_history")
		.select("*")
		.eq("cluster_id", body.cluster_id)
		.eq("approval_status", "pending_approval")
		.maybeSingle();

	if (clusterError) {
		return jsonResponse(500, { error: clusterError.message });
	}

	if (!clusterData) {
		return jsonResponse(404, {
			error: "Cluster not found or already approved",
		});
	}

	const entityType = clusterData.entity_type as EntityType;

	// Create golden record from stored field_selections
	const goldenRecord = {
		cluster_id: body.cluster_id,
		...(clusterData.field_selections as Record<string, unknown>),
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};

	const { data: goldenData, error: goldenError } = await queryGoldenEntities(sb, entityType)
		.insert(goldenRecord)
		.select()
		.maybeSingle();

	if (goldenError) {
		return jsonResponse(500, { error: goldenError.message });
	}

	// Update merge_history to mark as approved
	const { error: updateError } = await sb
		.from("merge_history")
		.update({
			approval_status: "approved",
			approved_at: new Date().toISOString(),
		})
		.eq("cluster_id", body.cluster_id);

	if (updateError) {
		// Golden record was created, but we couldn't mark as approved
		// Log this but don't fail the request
		console.error("Failed to update merge_history approval status:", updateError);
	}

	return jsonResponse(200, {
		cluster_id: body.cluster_id,
		golden_record: goldenData,
		entity_type: entityType,
	});
}
