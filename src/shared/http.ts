export function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
