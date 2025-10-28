import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

export async function getGoldenEntities(
	entityType: "artists" | "galleries" | "events",
	request: Request,
	env: Env
): Promise<Response> {
	const url = new URL(request.url);
	const limit = parseInt(url.searchParams.get("limit") || "50");
	const offset = parseInt(url.searchParams.get("offset") || "0");

	const sb = getServiceClient(env);

	const tableName = `golden_${entityType}`;

	const { data, error, count } = await sb
		.from(tableName as any)
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
