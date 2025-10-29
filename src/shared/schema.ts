import { z } from "zod";

/** Common helpers */
export const isoDateTime = z.string().datetime({ offset: true }).or(z.string()); // allow lenient input, validate upstream
export const money = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional()
}).partial();

/** ---- Gallery extraction schema ---- */
export const galleryExtractionSchema = z.object({
    name: z.string().optional(),
    about: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country_code: z.string().length(2).optional(),
    timezone: z.string().optional(),
    contacts: z.object({
        email: z.string().email().optional(),
        phone: z.string().optional()
    }).partial().optional(),
    social: z.object({
        instagram: z.string().url().optional(),
        twitter: z.string().url().optional(),
        website: z.string().url().optional()
    }).partial().optional(),
    tags: z.array(z.string()).optional(),
    hours: z.array(z.object({
        dow: z.number().int().min(0).max(6),
        open_time: z.string(),   // "10:00"
        close_time: z.string()   // "18:00"
    })).optional(),
    hours_exceptions: z.array(z.object({
        date: z.string(),        // "2025-12-25"
        open_time: z.string().optional(),
        close_time: z.string().optional(),
        note: z.string().optional()
    })).optional()
});

/** ---- Event extraction schema ---- */
const eventOccurrenceSchema = z.object({
    start_at: isoDateTime,
    end_at: isoDateTime.optional(),
    timezone: z.string().optional()
});

const eventItemSchema = z.object({
    title: z.string().min(1),
    start_at: isoDateTime.optional(),
    end_at: isoDateTime.optional(),
    timezone: z.string().optional(),
    status: z.enum(["scheduled", "cancelled", "postponed", "rescheduled", "unknown"]).optional(),
    ticket_url: z.string().url().optional(),
    prices: money.optional(),
    artists: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    occurrences: z.array(eventOccurrenceSchema).optional(),
    images: z.array(z.string()).optional()
});

/** Exported alias for clarity */
export const eventExtractionSchema = eventItemSchema;



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

export type PageExtraction = z.infer<typeof pageExtractionSchema>;
