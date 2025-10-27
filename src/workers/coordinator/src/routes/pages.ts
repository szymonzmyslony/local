import { jsonResponse } from "@/shared/http";

export async function getPages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "50";
  const status = url.searchParams.get("status");

  const endpoint = new URL("http://source/pages");
  endpoint.searchParams.set("limit", limit);
  if (status) {
    endpoint.searchParams.set("status", status);
  }

  const response = await env.SOURCE.fetch(endpoint.toString(), { method: "GET" });

  if (!response.ok) {
    return jsonResponse(response.status, {
      error: "Failed to fetch pages",
      details: await response.text(),
    });
  }

  return response;
}
