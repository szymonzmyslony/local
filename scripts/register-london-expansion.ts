import { z } from "zod";
import { LONDON_EXPANSION } from "./catalogues/london-expansion";

const environmentSchema = z
  .object({ OBSERVER_ADMIN_TOKEN: z.string().min(1) })
  .strict();
const responseSchema = z
  .object({ ok: z.literal(true), galleryId: z.string().uuid() })
  .strict();

const observerUrl = z.string().url().parse(process.argv[2]);
const batchSize = z.coerce.number().int().min(1).max(10).parse(process.argv[3] ?? 5);
const env = environmentSchema.parse({
  OBSERVER_ADMIN_TOKEN: process.env.OBSERVER_ADMIN_TOKEN
});

for (let offset = 0; offset < LONDON_EXPANSION.length; offset += batchSize) {
  const batch = LONDON_EXPANSION.slice(offset, offset + batchSize);
  const registered = await Promise.all(
    batch.map(async ([name, mainUrl, area]) => {
      const response = await fetch(new URL("/internal/galleries", observerUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.OBSERVER_ADMIN_TOKEN}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          market: "ldn",
          name,
          sources: { kind: "homepage", mainUrl },
          location: { kind: "area_only", area }
        })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(`${name}: registration returned ${response.status}`);
      }
      return { name, galleryId: responseSchema.parse(body).galleryId };
    })
  );
  console.log(JSON.stringify({ event: "registered_batch", registered }));
}

console.log(
  JSON.stringify({ event: "registration_complete", count: LONDON_EXPANSION.length })
);
