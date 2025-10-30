import { z } from "zod";
import { Constants } from "@shared/types/database_types";

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
    about: z.string().describe("About/mission paragraph in plain text"),
    email: z.string().describe("Primary contact email").optional(),
    phone: z.string().describe("Primary phone number").optional(),
    tags: z.array(z.string()).describe("List of tags or categories").optional(),
}).describe("Structured gallery information to persist in gallery_info and gallery_hours tables");

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
    ticket_url: z.string().optional(),
    description: z.string().optional(),
    prices: pricesSchema.optional(),
    artists: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    occurrences: z.array(eventOccurrenceSchema).optional(),
    images: z.array(z.string()).optional()
});

export const eventExtractionSchema = eventItemSchema;

// Page extraction discriminated union
export const pageExtractionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("gallery_main") }).describe("Gallery landing page"),
    z.object({ type: z.literal("gallery_about") }).describe("Gallery about/biography page"),
    z.object({ type: z.literal("event_list") }).describe("Events listing page"),
    z.object({ type: z.literal("other") }).describe("Non-event, non-gallery supporting page"),
    z.object({ type: z.literal("event_detail"), payload: eventExtractionSchema }).describe("Event detail page with structured payload")
]).describe("Structured classification of page content");

/** Convenience types */
export type GalleryExtraction = z.infer<typeof galleryExtractionSchema>;
export type EventExtraction = z.infer<typeof eventExtractionSchema>;
export type SchemaEventOccurrence = z.infer<typeof eventOccurrenceSchema>;
export type PageExtraction = z.infer<typeof pageExtractionSchema>;
