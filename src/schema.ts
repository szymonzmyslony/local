import { z } from "zod";

export const EventSchema = z.object({
    title: z.string().min(1),
    url: z.string(),
    event_type: z.enum(["opening", "reception", "talk", "workshop", "exhibition"]).optional(),
    start: z.string(),                    // normalize to epoch later
    end: z.string().optional().nullable(),
    artists: z.array(z.string()).default([]),
    image: z.string().url().optional()
});

export const GallerySchema = z.object({
    name: z.string().optional(),
    website: z.string(),
    gallery_type: z.string().optional(),
    city: z.string().optional(),
    neighborhood: z.string().optional(),
    tz: z.string().optional()
});

export const PageExtractSchema = z.object({
    gallery: GallerySchema.partial().extend({ website: z.string().url() }),
    events: z.array(EventSchema)
});