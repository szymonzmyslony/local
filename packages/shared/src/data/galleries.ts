import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseServiceClient } from "../database/client";
import type {
  Gallery,
  GalleryHoursInsert,
  GalleryInfo,
  GalleryInfoInsert,
  GalleryInfoUpdate,
  GalleryInsert,
  PageInsert
} from "../types/common";
import type { GalleryListItem, GalleryWithRelations } from "../types/domain";
import type { OpeningHoursItem } from "../schema";

function toError(operation: string, error: PostgrestError): Error {
  return new Error(`[${operation}] ${error.message}`);
}

export async function upsertGallery(
  client: SupabaseServiceClient,
  gallery: GalleryInsert
): Promise<Gallery> {
  const { data, error } = await client
    .from("galleries")
    .upsert(gallery, { onConflict: "normalized_main_url" })
    .select()
    .single();

  if (error) {
    throw toError("upsertGallery", error);
  }

  if (!data) {
    throw new Error("[upsertGallery] Supabase returned no data");
  }

  return data satisfies Gallery;
}

export async function upsertGalleryPage(
  client: SupabaseServiceClient,
  page: PageInsert
): Promise<string | null> {
  const { data, error } = await client
    .from("pages")
    .upsert([page], { onConflict: "normalized_url" })
    .select("id")
    .maybeSingle();

  if (error) {
    throw toError("upsertGalleryPage", error);
  }

  return data?.id ?? null;
}

export async function listRecentGalleries(
  client: SupabaseServiceClient,
  limit = 100
): Promise<GalleryListItem[]> {
  const { data, error } = await client
    .from("galleries")
    .select("id, main_url, about_url, normalized_main_url, events_page, gallery_info(name), gallery_hours(id, gallery_id, weekday, open_minutes)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw toError("listRecentGalleries", error);
  }

  return (data ?? []).map(row => ({
    ...row,
    gallery_info: row.gallery_info ?? null,
    gallery_hours: (row.gallery_hours ?? []).map(hours => ({
      gallery_id: hours.gallery_id,
      id: hours.id,
      weekday: hours.weekday,
      open_minutes: hours.open_minutes
    }))
  })) as GalleryListItem[];
}

export async function getGalleryWithInfo(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<GalleryWithRelations | null> {
  const { data, error } = await client
    .from("galleries")
    .select("*, gallery_info(*), gallery_hours(*)")
    .eq("id", galleryId)
    .maybeSingle();

  if (error) {
    throw toError("getGalleryWithInfo", error);
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    gallery_info: data.gallery_info ?? null,
    gallery_hours: data.gallery_hours ?? []
  } satisfies GalleryWithRelations;
}

export async function upsertGalleryInfo(
  client: SupabaseServiceClient,
  payload: GalleryInfoInsert
): Promise<void> {
  const { error } = await client
    .from("gallery_info")
    .upsert([payload], { onConflict: "gallery_id" });

  if (error) {
    throw toError("upsertGalleryInfo", error);
  }
}

export async function upsertGalleryHours(
  client: SupabaseServiceClient,
  rows: GalleryHoursInsert[]
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await client
    .from("gallery_hours")
    .upsert(rows, { onConflict: "gallery_id,weekday" });

  if (error) {
    throw toError("upsertGalleryHours", error);
  }
}

export type GalleryEditableInfo = Pick<
  GalleryInfo,
  "name" | "about" | "address" | "email" | "phone" | "instagram" | "tags"
>;

export async function saveGalleryInfo(
  client: SupabaseServiceClient,
  galleryId: string,
  info: GalleryEditableInfo
): Promise<void> {
  const timestamp = new Date().toISOString();
  const patch: GalleryInfoUpdate = {
    ...info,
    updated_at: timestamp
  };

  const { data, error } = await client
    .from("gallery_info")
    .update(patch)
    .eq("gallery_id", galleryId)
    .select("gallery_id")
    .maybeSingle();

  if (error) {
    throw toError("saveGalleryInfo.update", error);
  }

  if (!data) {
    const insertPayload: GalleryInfoInsert = {
      gallery_id: galleryId,
      updated_at: timestamp,
      data: {},
      ...info
    };
    const { error: insertError } = await client.from("gallery_info").insert([insertPayload]);
    if (insertError) {
      throw toError("saveGalleryInfo.insert", insertError);
    }
  }
}

export async function replaceGalleryHours(
  client: SupabaseServiceClient,
  galleryId: string,
  hours: OpeningHoursItem[]
): Promise<void> {
  const { error: deleteError } = await client.from("gallery_hours").delete().eq("gallery_id", galleryId);

  if (deleteError) {
    throw toError("replaceGalleryHours.delete", deleteError);
  }

  if (hours.length === 0) {
    return;
  }

  const rows: GalleryHoursInsert[] = hours.map(item => ({
    gallery_id: galleryId,
    weekday: item.weekday,
    open_minutes: item.open_minutes
  }));

  const { error } = await client.from("gallery_hours").insert(rows);

  if (error) {
    throw toError("replaceGalleryHours.insert", error);
  }
}

export async function selectGalleryName(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("gallery_info")
    .select("name")
    .eq("gallery_id", galleryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("selectGalleryName", error);
  }

  return data?.name ?? null;
}

export async function selectGalleryMainUrl(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("galleries")
    .select("main_url")
    .eq("id", galleryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("selectGalleryMainUrl", error);
  }

  return data?.main_url ?? null;
}

export async function selectGalleryAbout(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<string | null> {
  const { data, error } = await client
    .from("gallery_info")
    .select("about")
    .eq("gallery_id", galleryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("selectGalleryAbout", error);
  }

  return data?.about ?? null;
}

export async function selectGalleryTags(
  client: SupabaseServiceClient,
  galleryId: string
): Promise<string[] | null> {
  const { data, error } = await client
    .from("gallery_info")
    .select("tags")
    .eq("gallery_id", galleryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw toError("selectGalleryTags", error);
  }

  return data?.tags ?? null;
}
