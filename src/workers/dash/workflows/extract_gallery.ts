import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { createOpenAI } from "@ai-sdk/openai";
import { extractFromMarkdown } from "../../../shared/ai";
import type { Json } from "../../../types/database_types";

type Params = { galleryId: string };

export class ExtractGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { galleryId } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        // 1) Load gallery pages (main, about)
        const pages = await step.do("load-gallery-pages", async () => {
            const { data, error } = await supabase
                .from("pages")
                .select("id, kind, url, normalized_url")
                .eq("gallery_id", galleryId)
                .in("kind", ["gallery_main", "gallery_about"]);
            if (error) throw error;
            return data ?? [];
        });

        // 2) Load markdown for each page
        const { main, about } = await step.do("load-markdown", async () => {
            let mainMd = "";
            let mainUrl: string | null = null;
            let aboutMd = "";
            let aboutUrl: string | null = null;

            for (const p of pages) {
                const { data, error } = await supabase
                    .from("page_content")
                    .select("markdown")
                    .eq("page_id", p.id)
                    .limit(1);
                if (error) throw error;
                const md = data?.[0]?.markdown ?? "";
                if (p.kind === "gallery_main") {
                    mainMd = md;
                    mainUrl = p.url ?? p.normalized_url;
                } else if (p.kind === "gallery_about") {
                    aboutMd = md;
                    aboutUrl = p.url ?? p.normalized_url;
                }
            }
            return { main: { md: mainMd, url: mainUrl }, about: { md: aboutMd, url: aboutUrl } };
        });

        const combinedMd = [main.md, about.md].filter(Boolean).join("\n\n");
        if (!combinedMd.trim()) {
            return { ok: false as const, reason: "No content to extract" };
        }
        const primaryUrl = main.url ?? about.url ?? "";

        // 3) Run gallery extractor
        const result = await step.do("extract-gallery", async () =>
            extractFromMarkdown(openai, combinedMd, primaryUrl, 'gallery')
        );

        // 4) Save to gallery_info
        await step.do("save-gallery-info", async () => {
            const row = {
                gallery_id: galleryId,
                name: result.name ?? null,
                data: result as unknown as Json,
                source_page_id: pages.find(p => p.kind === "gallery_about")?.id ?? pages.find(p => p.kind === "gallery_main")?.id ?? null,
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabase.from("gallery_info").upsert([row], { onConflict: "gallery_id" });
            if (error) throw error;
        });

        // 5) Optionally save hours & exceptions (best-effort)
        await step.do("save-gallery-hours", async () => {
            if (Array.isArray(result.hours) && result.hours.length) {
                for (const h of result.hours) {
                    await supabase.from("gallery_hours").upsert([
                        {
                            gallery_id: galleryId,
                            dow: h.dow,
                            open_time: h.open_time,
                            close_time: h.close_time,
                        }
                    ], { onConflict: "gallery_id,dow" });
                }
            }
            if (Array.isArray(result.hours_exceptions) && result.hours_exceptions.length) {
                for (const e of result.hours_exceptions) {
                    await supabase.from("gallery_hours_exceptions").upsert([
                        {
                            gallery_id: galleryId,
                            date: e.date,
                            open_time: e.open_time ?? null,
                            close_time: e.close_time ?? null,
                            note: e.note ?? null,
                        }
                    ], { onConflict: "gallery_id,date" });
                }
            }
        });

        return { ok: true as const };
    }
}


