import { z } from 'zod';

export const ArtistZ = z.object({
    name: z.string(),
    bio: z.string().optional(),
    website: z.string().url().optional(),
    socials: z.array(z.string()).default([]),
});
export type Artist = z.infer<typeof ArtistZ>;

export const GalleryZ = z.object({
    name: z.string(),
    website: z.string().url().optional(),
    address: z.string().optional(),
    description: z.string().optional(),
});
export type Gallery = z.infer<typeof GalleryZ>;

export const EventZ = z.object({
    title: z.string(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    start_ts: z.string().datetime().optional(),
    end_ts: z.string().datetime().optional(),
    venue_name: z.string().optional(),
    participants: z.array(z.string()).default([]),
});
export type Event = z.infer<typeof EventZ>;

export const PageExtractZ = z.object({
    artists: z.array(ArtistZ).default([]),
    galleries: z.array(GalleryZ).default([]),
    events: z.array(EventZ).default([]),
});
export type PageExtract = z.infer<typeof PageExtractZ>;