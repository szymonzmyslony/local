import { z } from "zod";
import { Constants } from "../types/database_types";

/** Common helpers */
export const isoDateTime = z.string().datetime({ offset: true }).or(z.string());

// Money/pricing structure matching event_info.prices JSONB
export const pricesSchema = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional()
}).partial();

/** ---- Gallery extraction schema ---- */
// Aligns with gallery_info table columns
export const galleryExtractionSchema = z.object({
    name: z.string().optional(),
    about: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country_code: z.string().length(2).optional(),
    timezone: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    instagram: z.string().url().optional(),
    twitter: z.string().url().optional(),
    website: z.string().url().optional(),
    tags: z.array(z.string()).optional(),
    hours: z.array(z.object({
        dow: z.number().int().min(0).max(6),
        open_time: z.string(),
        close_time: z.string()
    })).optional()
});

/** ---- Event extraction schema ---- */
// Aligns with event_occurrences table
const eventOccurrenceSchema = z.object({
    start_at: isoDateTime,
    end_at: isoDateTime.optional(),
    timezone: z.string().optional()
});

// Aligns with events + event_info tables
const eventItemSchema = z.object({
    title: z.string().min(1),
    start_at: isoDateTime.optional(),
    end_at: isoDateTime.optional(),
    timezone: z.string().optional(),
    status: z.enum(Constants.public.Enums.event_status).optional(),
    ticket_url: z.string().url().optional(),
    description: z.string().optional(),
    prices: pricesSchema.optional(),
    artists: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    occurrences: z.array(eventOccurrenceSchema).optional(),
    images: z.array(z.string().url()).optional()
});

export const eventExtractionSchema = eventItemSchema;

// Page extraction discriminated union
export const pageExtractionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("gallery_main"),
    }),
    z.object({
        type: z.literal("gallery_about"),
    }),
    z.object({
        type: z.literal("event_detail"),
        payload: eventExtractionSchema
    }),
    z.object({
        type: z.literal("event_list"),
    }),
    z.object({
        type: z.literal("other"),
    })
]);

/** Convenience types */
export type GalleryExtraction = z.infer<typeof galleryExtractionSchema>;
export type EventExtraction = z.infer<typeof eventExtractionSchema>;
export type EventOccurrence = z.infer<typeof eventOccurrenceSchema>;
export type PageExtraction = z.infer<typeof pageExtractionSchema>;
