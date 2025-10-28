import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

export async function getIdentityEntities(
	entityType: "artist" | "gallery" | "event",
	request: Request,
	env: Env
): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const offset = parseInt(url.searchParams.get("offset") || "0");

	const sb = getServiceClient(env);

	const { data, error, count } = await sb
		.from("identity_entities")
		.select("id, entity_type, display_name, last_materialized_at, created_at", {
			count: "exact",
		})
		.eq("entity_type", entityType)
		.order("created_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	return jsonResponse(200, {
		entities: data || [],
		total: count || 0,
	});
}

export async function getCuratorQueueDirect(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");

	const sb = getServiceClient(env);

	// Query identity_links directly from Supabase
	const { data, error } = await sb
		.rpc("get_entities_for_review", {
			review_limit: limit,
		});

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	return jsonResponse(200, {
		queue: data || [],
	});
}
