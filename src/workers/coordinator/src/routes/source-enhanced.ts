import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

export async function getSourceEntities(
	entityType: "artists" | "galleries" | "events",
	request: Request,
	env: Env
): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const offset = parseInt(url.searchParams.get("offset") || "0");

	const sb = getServiceClient(env);

	const tableName = `source_${entityType}`;

	const { data, error, count } = await sb
		.from(tableName as any)
		.select("*", { count: "exact" })
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

export async function getPages(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const status = url.searchParams.get("status");

	const sb = getServiceClient(env);

	let query = sb
		.from("pages")
		.select("url, extraction_status, fetched_at", { count: "exact" })
		.order("fetched_at", { ascending: false })
		.limit(limit);

	if (status) {
		query = query.eq("extraction_status", status);
	}

	const { data, error, count } = await query;

	if (error) {
		return jsonResponse(500, { error: error.message });
	}

	return jsonResponse(200, {
		pages: data || [],
		total: count || 0,
	});
}
