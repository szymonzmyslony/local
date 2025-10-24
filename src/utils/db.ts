import type { Database, TablesInsert } from "../types/database_types";
import type {
  Event,
  ScrapedPage,
  ScrapedPageMetadata,
  Artist,
  EventExtraction
} from "../schema";
import { calculateDefaultEnd } from "./extraction";
import { generateEventId, generateArtistId } from "./identity";
import { createSupabaseClient } from "./supabase";

/**
 * GALLERY
 */
export async function upsertGallery(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  galleryId: string,
  gallery: Omit<TablesInsert<"galleries">, "id" | "created_at" | "updated_at">
): Promise<void> {
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const now = Date.now();

  const { error } = await client
    .from('galleries')
    .upsert({
      id: galleryId,
      name: gallery.name,
      website: gallery.website,
      gallery_type: gallery.gallery_type ?? null,
      city: gallery.city,
      neighborhood: gallery.neighborhood ?? null,
      tz: gallery.tz ?? 'Europe/Warsaw',
      embedding: gallery.embedding ?? null,
      created_at: now,
      updated_at: now
    });

  if (error) {
    console.error("[db] upsertGallery error", { galleryId, error });
    throw error;
  }
}

/**
 * SCRAPED PAGES
 */
export async function insertScrapedPages(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  galleryId: string,
  pages: Array<{
    id: string;
    url: string;
    markdown: string;
    metadata: ScrapedPageMetadata;
  }>
): Promise<void> {
  if (pages.length === 0) return;
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const scrapedAt = Date.now();

  const { error } = await client
    .from('scraped_pages')
    .upsert(
      pages.map(p => ({
        id: p.id,
        url: p.url,
        gallery_id: galleryId,
        markdown: p.markdown,
        metadata: p.metadata,
        classification: null,
        scraped_at: scrapedAt
      }))
    );

  if (error) {
    console.error("[db] insertScrapedPages error", { galleryId, count: pages.length, error });
    throw error;
  }
}

/**
 * Update classifications for scraped pages
 */
export async function updatePageClassifications(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  pages: Array<{ id: string; classification: Database["public"]["Enums"]["page_classification"] }>
): Promise<void> {
  if (pages.length === 0) return;
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const promises = pages.map(p =>
    client
      .from('scraped_pages')
      .update({ classification: p.classification })
      .eq('id', p.id)
  );

  const results = await Promise.all(promises);
  const errors = results.filter((r: { error: any }) => r.error);

  if (errors.length > 0) {
    console.error("[db] updatePageClassifications errors", { count: errors.length, errors });
    throw errors[0].error;
  }
}

/**
 * Get pages by classification type
 */
export async function getPagesByClassification(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  galleryId: string,
  classification: Database["public"]["Enums"]["page_classification"]
): Promise<Array<{ id: string; url: string; markdown: string }>> {
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await client
    .from('scraped_pages')
    .select('id, url, markdown')
    .eq('gallery_id', galleryId)
    .eq('classification', classification);

  if (error) {
    console.error("[db] getPagesByClassification error", { galleryId, classification, error });
    throw error;
  }

  return data;
}

/**
 * ARTISTS (global dedupe by normalized name + website host)
 */
export async function upsertArtists(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  artists: Array<{ name: string; bio?: string | null; website?: string | null; aliases?: string[]; sourceUrl?: string }>
): Promise<Map<string, string>> {
  if (artists.length === 0) return new Map();

  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const now = Date.now();
  const artistMap = new Map<string, string>();

  const byId = new Map<string, { name: string; bio?: string | null; website?: string | null; aliases?: string[]; sourceUrl?: string }>();
  for (const a of artists) {
    const id = generateArtistId(a.name, a.website ?? null);
    if (!byId.has(id)) byId.set(id, a);
  }

  for (const [id, artist] of byId) {
    const { error } = await client
      .from('artists')
      .upsert({
        id,
        name: artist.name.trim(),
        bio: artist.bio ?? null,
        website: artist.website ?? null,
        embedding: null,
        created_at: now,
        updated_at: now
      });

    if (error) {
      console.error("[db] upsertArtists error", { id, name: artist.name, error });
      throw error;
    }

    artistMap.set(artist.name.trim(), id);
    for (const alias of artist.aliases || []) {
      artistMap.set(alias.trim(), id);
    }
  }

  return artistMap;
}

/**
 * EVENTS (per-gallery dedupe by title+start)
 */
export async function insertEvents(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  events: Array<EventExtraction & { artistNames: string[] }>,
  galleryId: string
): Promise<Map<string, string>> {
  if (events.length === 0) return new Map();

  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const now = Date.now();
  const eventMap = new Map<string, string>();

  for (const event of events) {
    const id = generateEventId(galleryId, event.title, event.start);
    const end = event.end || calculateDefaultEnd(event.start, event.eventType);
    const price = event.price ?? 0;

    const { error } = await client
      .from('events')
      .upsert({
        id,
        gallery_id: galleryId,
        title: event.title,
        description: event.description,
        event_type: event.eventType,
        category: event.category,
        tags: event.tags,
        start: event.start,
        end: end,
        price: price,
        embedding: null,
        created_at: now,
        updated_at: now
      });

    if (error) {
      console.error("[db] insertEvents error", { id, title: event.title, start: event.start, error });
      throw error;
    }

    eventMap.set(`${event.title}:${event.start}`, id);
  }

  return eventMap;
}

/**
 * EVENT ↔ ARTIST links
 */
export async function linkEventsToArtists(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  events: Array<EventExtraction & { artistNames: string[] }>,
  eventMap: Map<string, string>,
  artistMap: Map<string, string>
): Promise<void> {
  const links: TablesInsert<"event_artists">[] = [];

  for (const e of events) {
    const eventId = eventMap.get(`${e.title}:${e.start}`);
    if (!eventId) continue;

    for (const artistName of e.artistNames) {
      const artistId = artistMap.get(artistName.trim());
      if (!artistId) continue;

      links.push({
        event_id: eventId,
        artist_id: artistId
      });
    }
  }

  if (links.length === 0) return;

  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { error } = await client
    .from('event_artists')
    .upsert(links, { ignoreDuplicates: true });

  if (error) {
    console.error("[db] linkEventsToArtists error", { pairs: links.length, error });
    throw error;
  }
}

/**
 * Reads
 */
export async function getEventsByGallery(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  galleryId: string
): Promise<Event[]> {
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await client
    .from('events')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('start', { ascending: true });

  if (error) {
    console.error("[db] getEventsByGallery error", { galleryId, error });
    throw error;
  }

  return data;
}

export async function getArtistsByEvent(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  eventId: string
): Promise<Artist[]> {
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error } = await client
    .from('event_artists')
    .select(`
      artists (
        id,
        name,
        bio,
        website,
        embedding,
        created_at,
        updated_at
      )
    `)
    .eq('event_id', eventId);

  if (error) {
    console.error("[db] getArtistsByEvent error", { eventId, error });
    throw error;
  }

  return data.map((item: { artists: Artist }) => item.artists);
}

export async function getScrapedPagesByGallery(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  galleryId: string
): Promise<ScrapedPage[]> {
  const client = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { data, error} = await client
    .from('scraped_pages')
    .select('*')
    .eq('gallery_id', galleryId);

  if (error) {
    console.error("[db] getScrapedPagesByGallery error", { galleryId, error });
    throw error;
  }

  return data;
}
