import { jsonResponse, readJson } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";
import type { EntityType } from "@/shared/messages";
import { getExtractedTableName, getSearchFieldName, queryExtractedEntities } from "../lib/table-helpers";

/**
 * GET /api/extracted/:type
 * List extracted entities with filtering and pagination
 */
export async function getExtractedEntities(
	entityType: EntityType,
	request: Request,
	env: Env
): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const offset = parseInt(url.searchParams.get("offset") || "0");
	const status = url.searchParams.get("status"); // pending_review, approved, rejected, modified
	const search = url.searchParams.get("search");
	const pageUrl = url.searchParams.get("page_url");
	const crawlJobId = url.searchParams.get("crawl_job_id");

	const sb = getServiceClient(env);

	let query = queryExtractedEntities(sb, entityType)
		.select("*", { count: "exact" })
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (status) {
		query = query.eq("review_status", status);
	}

	if (search) {
		// Search by name/title depending on entity type
		const searchField = getSearchFieldName(entityType);
		query = query.ilike(searchField, `%${search}%`);
	}

	if (pageUrl) {
		query = query.eq("page_url", pageUrl);
	}

	if (crawlJobId) {
		// Filter by crawl job: get URLs from discovered_urls for this job
		const { data: jobUrls } = await sb
			.from("discovered_urls")
			.select("url")
			.eq("job_id", crawlJobId);

		const urls = jobUrls?.map(u => u.url) || [];
		if (urls.length > 0) {
			query = query.in("page_url", urls);
		} else {
			// No URLs for this job, return empty
			return jsonResponse(200, { entities: [], total: 0 });
		}
	}

	const { data, error, count } = await query;

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	return jsonResponse(200, {
		entities: data || [],
		total: count || 0,
	});
}

/**
 * GET /api/extracted/:type/:id
 * Get single extracted entity by ID
 */
export async function getExtractedEntity(
	entityType: EntityType,
	entityId: string,
	env: Env
): Promise<Response> {
	const sb = getServiceClient(env);

	const { data, error } = await queryExtractedEntities(sb, entityType)
		.select("*")
		.eq("id", entityId)
		.maybeSingle();

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	if (!data) {
		return jsonResponse(404, { error: "Entity not found" });
	}

	return jsonResponse(200, { entity: data });
}

/**
 * PATCH /api/extracted/:type/:id
 * Edit extracted entity fields (curator corrections before approval)
 */
export async function updateExtractedEntity(
	entityType: EntityType,
	entityId: string,
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<Record<string, unknown>>(request);

	if (!body || Object.keys(body).length === 0) {
		return jsonResponse(400, { error: "No fields provided to update" });
	}

	const sb = getServiceClient(env);

	// Set review_status to 'modified' when curator edits
	const updates = {
		...body,
		review_status: "modified",
		reviewed_at: new Date().toISOString(),
	};

	const { data, error } = await queryExtractedEntities(sb, entityType)
		.update(updates)
		.eq("id", entityId)
		.select()
		.maybeSingle();

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	if (!data) {
		return jsonResponse(404, { error: "Entity not found" });
	}

	return jsonResponse(200, { entity: data });
}

/**
 * POST /api/extracted/:type/bulk-approve
 * Approve multiple entities and optionally trigger similarity
 */
export async function bulkApproveEntities(
	entityType: EntityType,
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{
		entity_ids: string[];
		trigger_similarity?: boolean;
		threshold?: number;
	}>(request);

	if (!body?.entity_ids || body.entity_ids.length === 0) {
		return jsonResponse(400, { error: "entity_ids array is required" });
	}

	const sb = getServiceClient(env);

	// Update entities to approved
	const { data, error } = await queryExtractedEntities(sb, entityType)
		.update({
			review_status: "approved",
			reviewed_at: new Date().toISOString(),
		})
		.in("id", body.entity_ids)
		.select("id");

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	const approvedCount = data?.length || 0;

	// Optionally trigger similarity computation
	if (body.trigger_similarity && approvedCount > 0) {
		const queue = env.SIMILARITY_PRODUCER;

		for (const entity of data) {
			await queue.send({
				type: `similarity.compute.${entityType}` as `similarity.compute.${EntityType}`,
				entityId: entity.id,
				threshold: body.threshold,
			});
		}
	}

	return jsonResponse(200, {
		approved: approvedCount,
		similarity_triggered: body.trigger_similarity && approvedCount > 0,
	});
}

/**
 * POST /api/extracted/:type/bulk-reject
 * Reject multiple entities
 */
export async function bulkRejectEntities(
	entityType: EntityType,
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{ entity_ids: string[] }>(request);

	if (!body?.entity_ids || body.entity_ids.length === 0) {
		return jsonResponse(400, { error: "entity_ids array is required" });
	}

	const sb = getServiceClient(env);

	const { data, error } = await queryExtractedEntities(sb, entityType)
		.update({
			review_status: "rejected",
			reviewed_at: new Date().toISOString(),
		})
		.in("id", body.entity_ids)
		.select("id");

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	return jsonResponse(200, {
		rejected: data?.length || 0,
	});
}

/**
 * POST /api/extracted/bulk-approve-by-page
 * Approve all entities from specific pages (curator workflow)
 */
export async function bulkApproveByPage(
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{
		page_urls: string[];
		entity_types: EntityType[];
		trigger_similarity?: boolean;
		threshold?: number;
	}>(request);

	if (!body?.page_urls || body.page_urls.length === 0) {
		return jsonResponse(400, { error: "page_urls array is required" });
	}

	if (!body?.entity_types || body.entity_types.length === 0) {
		return jsonResponse(400, { error: "entity_types array is required" });
	}

	const sb = getServiceClient(env);
	let totalApproved = 0;
	const entityIdsByType: Record<string, string[]> = {};

	// Approve all entities from specified pages
	for (const entityType of body.entity_types) {
		const { data, error } = await queryExtractedEntities(sb, entityType)
			.update({
				review_status: "approved",
				reviewed_at: new Date().toISOString(),
			})
			.in("page_url", body.page_urls)
			.eq("review_status", "pending_review")
			.select("id");

		if (error) {
			return jsonResponse(500, { error: error.message });
		}

		const ids = data?.map(e => e.id) || [];
		entityIdsByType[entityType] = ids;
		totalApproved += ids.length;

		// Queue for similarity if requested
		if (body.trigger_similarity && ids.length > 0) {
			const queue = env.SIMILARITY_PRODUCER;

			for (const id of ids) {
				await queue.send({
					type: `similarity.compute.${entityType}` as `similarity.compute.${EntityType}`,
					entityId: id,
					threshold: body.threshold,
				});
			}
		}
	}

	return jsonResponse(200, {
		approved: totalApproved,
		queued_for_similarity: body.trigger_similarity ? totalApproved : 0,
		entity_ids: entityIdsByType,
	});
}
