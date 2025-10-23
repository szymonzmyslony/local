import type {
  Gallery,
  Event,
  ScrapedPage,
  ScrapedPageMetadata,
  Artist,
  EventExtraction
} from "../schema";
import type {
  D1EventRow,
  D1ArtistRow,
  D1ScrapedPageRow
} from "../types/d1";
import { calculateDefaultEnd } from "./extraction";

/**
 * Generate deterministic IDs
 */
export function generateEventId(
  galleryId: string,
  title: string,
  start: string
): string {
  const uniqueString = `${galleryId}:${title}:${start}`;
  return Buffer.from(uniqueString).toString("base64").substring(0, 16);
}

export function generateArtistId(name: string): string {
  return Buffer.from(name.toLowerCase().trim())
    .toString("base64")
    .substring(0, 16);
}

/**
 * Insert or update gallery in D1
 */
export async function upsertGallery(
  db: D1Database,
  galleryId: string,
  gallery: Gallery
): Promise<void> {
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO galleries (id, name, website, gallery_type, city, neighborhood, tz, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT(id) DO UPDATE SET
         name = ?2,
         website = ?3,
         gallery_type = ?4,
         city = ?5,
         neighborhood = ?6,
         tz = ?7,
         updated_at = ?9`
    )
    .bind(
      galleryId,
      gallery.name,
      gallery.website,
      gallery.galleryType ?? null,
      gallery.city,
      gallery.neighborhood ?? null,
      gallery.tz,
      now,
      now
    )
    .run();
}

/**
 * Insert scraped pages in batch (idempotent - uses INSERT OR REPLACE)
 */
export async function insertScrapedPages(
  db: D1Database,
  galleryId: string,
  pages: Array<{
    id: string;
    url: string;
    markdown: string;
    metadata: ScrapedPageMetadata;
  }>
): Promise<void> {
  if (pages.length === 0) return;

  const scrapedAt = Date.now();
  console.log(
    `[insertScrapedPages] Building ${pages.length} SQL statements...`
  );

  const statements = pages.map((page) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO scraped_pages
         (id, url, gallery_id, markdown, metadata, scraped_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(
        page.id,
        page.url,
        galleryId,
        page.markdown,
        JSON.stringify(page.metadata),
        scrapedAt
      )
  );

  console.log(
    `[insertScrapedPages] Executing D1 batch (${statements.length} statements)...`
  );

  try {
    const result = await db.batch(statements);
    console.log(
      `[insertScrapedPages] ✅ Batch complete, results:`,
      result?.length || 0
    );
  } catch (error) {
    console.error(`[insertScrapedPages ERROR]`, error);
    console.error(`[insertScrapedPages ERROR] Gallery ID: ${galleryId}`);
    console.error(`[insertScrapedPages ERROR] Page count: ${pages.length}`);
    console.error(`[insertScrapedPages ERROR] Sample page:`, pages[0]);
    throw error;
  }
}

/**
 * Insert or update artists, return name->id map
 */
export async function upsertArtists(
  db: D1Database,
  artists: Array<{ name: string; bio?: string | null; website?: string | null }>
): Promise<Map<string, string>> {
  if (artists.length === 0) return new Map();

  const now = Date.now();
  const artistMap = new Map<string, string>();

  // Deduplicate by name
  const uniqueArtists = Array.from(
    new Map(artists.map((a) => [a.name.trim(), a])).values()
  );

  for (const artist of uniqueArtists) {
    const id = generateArtistId(artist.name);

    await db
      .prepare(
        `INSERT INTO artists (id, name, bio, website, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(name) DO UPDATE SET
           bio = COALESCE(?3, bio),
           website = COALESCE(?4, website),
           updated_at = ?6`
      )
      .bind(
        id,
        artist.name.trim(),
        artist.bio ?? null,
        artist.website ?? null,
        now,
        now
      )
      .run();

    artistMap.set(artist.name.trim(), id);
  }

  console.log(`[upsertArtists] Upserted ${artistMap.size} artists`);
  return artistMap;
}

/**
 * Insert events and return title+start->id map
 */
export async function insertEvents(
  db: D1Database,
  events: Array<EventExtraction & { artistNames: string[] }>,
  galleryId: string
): Promise<Map<string, string>> {
  if (events.length === 0) return new Map();

  const now = Date.now();
  const eventMap = new Map<string, string>();

  console.log(`[insertEvents] Starting insertion of ${events.length} events`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    try {
      const id = generateEventId(galleryId, event.title, event.start);
      const end = event.end || calculateDefaultEnd(event.start, event.eventType);
      const price = event.price ?? 0;

      console.log(`[insertEvents] Inserting event ${i + 1}/${events.length}: "${event.title}"`);

      await db
        .prepare(
          `INSERT INTO events (id, gallery_id, title, description, event_type, category, tags, start, end, price, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
           ON CONFLICT(gallery_id, title, start) DO UPDATE SET
             description = excluded.description,
             event_type = excluded.event_type,
             category = excluded.category,
             tags = excluded.tags,
             end = excluded.end,
             price = excluded.price,
             updated_at = excluded.updated_at`
        )
        .bind(
          id,
          galleryId,
          event.title,
          event.description,
          event.eventType,
          event.category,
          JSON.stringify(event.tags),
          event.start,
          end,
          price,
          now,
          now
        )
        .run();

      eventMap.set(`${event.title}:${event.start}`, id);
    } catch (error) {
      console.error(`[insertEvents ERROR] Failed to insert event ${i + 1}/${events.length}`);
      console.error(`[insertEvents ERROR] Event title: "${event.title}"`);
      console.error(`[insertEvents ERROR] Event start: ${event.start}`);
      console.error(`[insertEvents ERROR] Event end: ${event.end}`);
      console.error(`[insertEvents ERROR] Event data:`, JSON.stringify(event, null, 2));
      console.error(`[insertEvents ERROR] Error:`, error);
      throw error; // Re-throw to trigger workflow retry
    }
  }

  console.log(`[insertEvents] Upserted ${eventMap.size} events`);
  return eventMap;
}

/**
 * Link events to artists via junction table
 */
export async function linkEventsToArtists(
  db: D1Database,
  events: Array<EventExtraction & { artistNames: string[] }>,
  eventMap: Map<string, string>,
  artistMap: Map<string, string>
): Promise<void> {
  const statements = [];

  for (const event of events) {
    const eventId = eventMap.get(`${event.title}:${event.start}`);
    if (!eventId) {
      console.warn(
        `[linkEventsToArtists] Event ID not found for: ${event.title}`
      );
      continue;
    }

    for (const artistName of event.artistNames) {
      const artistId = artistMap.get(artistName.trim());
      if (!artistId) {
        console.warn(
          `[linkEventsToArtists] Artist ID not found for: ${artistName}`
        );
        continue;
      }

      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO event_artists (event_id, artist_id)
             VALUES (?1, ?2)`
          )
          .bind(eventId, artistId)
      );
    }
  }

  if (statements.length > 0) {
    await db.batch(statements);
    console.log(
      `[linkEventsToArtists] Linked ${statements.length} event-artist relationships`
    );
  }
}

/**
 * Get all events for a gallery (with artists populated)
 */
export async function getEventsByGallery(
  db: D1Database,
  galleryId: string
): Promise<Event[]> {
  const { results } = await db
    .prepare(`SELECT * FROM events WHERE gallery_id = ?1 ORDER BY start ASC`)
    .bind(galleryId)
    .all();

  return ((results || []) as unknown as D1EventRow[]).map((row) => ({
    id: row.id,
    galleryId: row.gallery_id,
    title: row.title,
    description: row.description,
    eventType: row.event_type as Event["eventType"],
    category: row.category as Event["category"],
    tags: JSON.parse(row.tags),
    start: row.start,
    end: row.end,
    price: row.price,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

/**
 * Get artists for an event
 */
export async function getArtistsByEvent(
  db: D1Database,
  eventId: string
): Promise<Artist[]> {
  const { results } = await db
    .prepare(
      `SELECT a.* FROM artists a
       JOIN event_artists ea ON a.id = ea.artist_id
       WHERE ea.event_id = ?1`
    )
    .bind(eventId)
    .all();

  return ((results || []) as unknown as D1ArtistRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    bio: row.bio,
    website: row.website,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

/**
 * Get scraped pages for a gallery
 */
export async function getScrapedPagesByGallery(
  db: D1Database,
  galleryId: string
): Promise<ScrapedPage[]> {
  const { results } = await db
    .prepare(`SELECT * FROM scraped_pages WHERE gallery_id = ?1`)
    .bind(galleryId)
    .all();

  return ((results || []) as unknown as D1ScrapedPageRow[]).map((row) => ({
    id: row.id,
    url: row.url,
    galleryId: row.gallery_id,
    markdown: row.markdown,
    metadata: JSON.parse(row.metadata) as ScrapedPageMetadata,
    scrapedAt: row.scraped_at
  }));
}
