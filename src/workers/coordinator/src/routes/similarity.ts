import { jsonResponse, readJson } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";
import type { EntityType } from "@/shared/messages";
import { getSimilarityFunctionName, queryLinksTable } from "../lib/table-helpers";

/**
 * POST /api/similarity/trigger
 * Manually trigger similarity computation for approved entities
 */
export async function triggerSimilarity(
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{
		entity_type: EntityType;
		entity_ids: string[];
		threshold?: number;
	}>(request);

	if (!body?.entity_type || !body.entity_ids || body.entity_ids.length === 0) {
		return jsonResponse(400, {
			error: "entity_type and entity_ids are required",
		});
	}

	const queue = env.SIMILARITY_PRODUCER;
	let sentCount = 0;

	for (const entityId of body.entity_ids) {
		await queue.send({
			type: `similarity.compute.${body.entity_type}` as `similarity.compute.${EntityType}`,
			entityId,
			threshold: body.threshold,
		});
		sentCount++;
	}

	return jsonResponse(200, {
		queued: sentCount,
		entity_type: body.entity_type,
	});
}

/**
 * GET /api/similarity/pairs/:type
 * Get similarity pairs for curator review
 */
export async function getSimilarityPairs(
	entityType: EntityType,
	request: Request,
	env: Env
): Promise<Response> {
	const url = new URL(request.url);
	const minSimilarity = parseFloat(
		url.searchParams.get("min_similarity") || "0.85"
	);
	const maxSimilarity = parseFloat(
		url.searchParams.get("max_similarity") || "0.95"
	);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const status = url.searchParams.get("status") || "pending"; // pending, merged, dismissed
	const crawlJobId = url.searchParams.get("crawl_job_id");

	const sb = getServiceClient(env);

	// Use the database function to get pairs
	const functionName = getSimilarityFunctionName(entityType);

	const { data, error } = await sb.rpc(functionName as "get_artist_pairs_for_review" | "get_gallery_pairs_for_review" | "get_event_pairs_for_review", {
		min_similarity: minSimilarity,
		max_similarity: maxSimilarity,
		review_limit: limit,
	});

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	// Filter by curator decision if not pending
	let pairs = data || [];
	if (status !== "pending") {
		// For non-pending, we need to query the links table directly
		const { data: filteredPairs, error: linksError } = await queryLinksTable(sb, entityType)
			.select("*")
			.eq("curator_decision", status)
			.order("similarity_score", { ascending: false })
			.limit(limit);

		if (linksError) {
			return jsonResponse(500, { error: linksError.message });
		}

		pairs = filteredPairs || [];
	}

	// Filter by crawl job if specified (cross-job pairs by default)
	if (crawlJobId && pairs.length > 0) {
		// Get URLs from this crawl job
		const { data: jobUrls } = await sb
			.from("discovered_urls")
			.select("url")
			.eq("job_id", crawlJobId);

		const urlSet = new Set(jobUrls?.map(u => u.url) || []);

		// Filter pairs where both entities are from this job's pages
		pairs = pairs.filter((pair: { source_a_page_url: string; source_b_page_url: string }) =>
			urlSet.has(pair.source_a_page_url) && urlSet.has(pair.source_b_page_url)
		);
	}

	return jsonResponse(200, {
		pairs: pairs,
		total: pairs.length,
	});
}

/**
 * POST /api/similarity/pairs/:linkId/merge
 * Mark a similarity pair as "should merge"
 */
export async function markPairForMerge(
	linkId: string,
	entityType: EntityType,
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{ notes?: string }>(request);

	const sb = getServiceClient(env);

	const { data, error } = await queryLinksTable(sb, entityType)
		.update({
			curator_decision: "merged",
			curator_decided_at: new Date().toISOString(),
			curator_notes: body?.notes || null,
		})
		.or(`source_a_id.eq.${linkId},source_b_id.eq.${linkId}`)
		.select()
		.maybeSingle();

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	if (!data) {
		return jsonResponse(404, { error: "Link not found" });
	}

	return jsonResponse(200, { link: data });
}

/**
 * POST /api/similarity/pairs/:linkId/dismiss
 * Mark a similarity pair as "not duplicates"
 */
export async function dismissPair(
	linkId: string,
	entityType: EntityType,
	request: Request,
	env: Env
): Promise<Response> {
	const body = await readJson<{ notes?: string }>(request);

	const sb = getServiceClient(env);

	const { data, error } = await queryLinksTable(sb, entityType)
		.update({
			curator_decision: "dismissed",
			curator_decided_at: new Date().toISOString(),
			curator_notes: body?.notes || null,
		})
		.or(`source_a_id.eq.${linkId},source_b_id.eq.${linkId}`)
		.select()
		.maybeSingle();

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	if (!data) {
		return jsonResponse(404, { error: "Link not found" });
	}

	return jsonResponse(200, { link: data });
}
