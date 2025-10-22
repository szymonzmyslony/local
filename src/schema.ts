import { z } from "zod";

export const EventSchema = z.object({
    title: z.string().min(1),
    url: z.string(),
    event_type: z.enum(["opening", "reception", "talk", "workshop", "exhibition"]).optional(),
    start: z.string(),                    // normalize to epoch later
    end: z.string().optional().nullable(),
    artists: z.array(z.string()).default([]),
    image: z.string().optional()
});

export type Event = z.infer<typeof EventSchema>;

export const GallerySchema = z.object({
    name: z.string().optional(),
    website: z.string(),
    gallery_type: z.string().optional(),
    city: z.string().optional(),
    neighborhood: z.string().optional(),
    tz: z.string().optional()
});

export type Gallery = z.infer<typeof GallerySchema>;

export const PageExtractSchema = z.object({
    gallery: GallerySchema.partial().extend({ website: z.string() }),
    events: z.array(EventSchema)
});

export type PageExtract = z.infer<typeof PageExtractSchema>;

export const PageClassificationEnum = z.enum(['event', 'general', 'other']);

export type PageClassification = z.infer<typeof PageClassificationEnum>;

export const PageClassificationSchema = z.object({
    classification: PageClassificationEnum
});