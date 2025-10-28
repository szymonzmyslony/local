import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

export async function getDiscoveredUrls(
  jobId: string,
  env: Env
): Promise<Response> {
  const sb = getServiceClient(env);

  const { data, error, count } = await sb
    .from("discovered_urls")
    .select("url, status, fetch_attempts", { count: "exact" })
    .eq("job_id", jobId)
    .order("url", { ascending: true })
    .limit(100);

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, {
    urls: data || [],
    total: count || 0
  });
}
