import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

// GET /api/pages/:encodedUrl/entities
export async function getPageEntities(
  encodedUrl: string,
  env: Env
): Promise<Response> {
  const url = decodeURIComponent(encodedUrl);
  const sb = getServiceClient(env);

  const [artists, galleries, events] = await Promise.all([
    sb.from("extracted_artists").select("*").eq("page_url", url),
    sb.from("extracted_galleries").select("*").eq("page_url", url),
    sb.from("extracted_events").select("*").eq("page_url", url)
  ]);

  return jsonResponse(200, {
    url,
    entities: {
      artists: artists.data || [],
      galleries: galleries.data || [],
      events: events.data || []
    }
  });
}
