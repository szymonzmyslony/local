import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { getServiceClient } from "../../../shared/supabase";
import { createOpenAI } from "@ai-sdk/openai";
import { extractGalleryInfoFromMarkdown } from "../../../shared/ai";
import type { GalleryInfoInsert, GalleryHoursInsert } from "../../../types/common";

type Params = { galleryId: string };

export class ExtractGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { galleryId } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        console.log(`[ExtractGallery] Starting - gallery ${galleryId}`);

        // 1) Load gallery pages (main, about)
        const pages = await step.do("load-gallery-pages", async () => {
            const { data, error } = await supabase
                .from("pages")
                .select("id, kind, url, normalized_url")
                .eq("gallery_id", galleryId)
                .in("kind", ["gallery_main", "gallery_about"]);
            if (error) throw error;
            const rows = data ?? [];
            console.log(`[ExtractGallery] Loaded ${rows.length} gallery pages`);
            const expectedKinds = new Set<"gallery_main" | "gallery_about">(["gallery_main", "gallery_about"]);
            const presentKinds = new Set(rows.map(p => p.kind as "gallery_main" | "gallery_about"));
            const missingKinds = [...expectedKinds].filter(kind => !presentKinds.has(kind));
            const unexpectedKinds = rows.filter(row => !expectedKinds.has(row.kind as "gallery_main" | "gallery_about")).map(row => row.kind);
            console.log(`[ExtractGallery] Expected kinds: ${[...expectedKinds].join(", ")} | Present kinds: ${[...presentKinds].join(", ") || "none"}`);
            if (missingKinds.length > 0) {
                console.log(`[ExtractGallery] Missing expected kinds: ${missingKinds.join(", ")}`);
            }
            if (unexpectedKinds.length > 0) {
                console.log(`[ExtractGallery] Unexpected kinds encountered: ${unexpectedKinds.join(", ")}`);
            }
            if (!rows.length) {
                console.log("[ExtractGallery] No gallery pages found; ensure SeedGallery ran successfully.");
            } else {
                rows.forEach(p => {
                    console.log(`[ExtractGallery] Page ${p.id} kind=${p.kind} url=${p.url ?? p.normalized_url}`);
                });
            }
            return rows;
        });

        // 2) Load markdown for each page
        const { main, about } = await step.do("load-markdown", async () => {
            if (!pages.length) {
                return {
                    main: { md: "", url: null as string | null },
                    about: { md: "", url: null as string | null },
                };
            }

            const pageIds = pages.map(p => p.id);
            const { data, error } = await supabase
                .from("page_content")
                .select("page_id, markdown")
                .in("page_id", pageIds);
            if (error) throw error;
            const contentByPage = new Map<string, string>(
                (data ?? []).map(row => [row.page_id, (row.markdown ?? "") as string])
            );

            const mainPage = pages.find(p => p.kind === "gallery_main");
            const aboutPage = pages.find(p => p.kind === "gallery_about");

            const mainMd = contentByPage.get(mainPage?.id ?? "") ?? "";
            const aboutMd = contentByPage.get(aboutPage?.id ?? "") ?? "";
            console.log(`[ExtractGallery] Markdown lengths main=${mainMd.length} about=${aboutMd.length}`);
            if (!mainMd && !aboutMd) {
                console.log("[ExtractGallery] No markdown found for pages. Did ScrapePages run?");
            }

            return {
                main: { md: mainMd, url: mainPage?.url ?? mainPage?.normalized_url ?? null },
                about: { md: aboutMd, url: aboutPage?.url ?? aboutPage?.normalized_url ?? null },
            };
        });

        const combinedMd = [main.md, about.md].filter(Boolean).join("\n\n");
        if (!combinedMd.trim()) {
            console.log(`[ExtractGallery] No content to extract for gallery ${galleryId} (combinedMd length ${combinedMd.length})`);
            return { ok: false as const, reason: "No content to extract" };
        }
        const primaryUrl = main.url ?? about.url ?? "";

        console.log(`[ExtractGallery] Extracting from ${combinedMd.length} chars of markdown`);

        // 3) Run gallery extractor
        const result = await step.do("extract-gallery", async () =>
            extractGalleryInfoFromMarkdown(openai, combinedMd, primaryUrl)
        );

        console.log(`[ExtractGallery] Extracted gallery: ${result.name ?? 'unnamed'}`);

        const normalizeInstagramHandle = (value: string | undefined): string | null => {
            if (!value) return null;
            const trimmed = value.trim();
            if (!trimmed) return null;
            const withoutScheme = trimmed.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
            const handle = withoutScheme.startsWith("@") ? withoutScheme.slice(1) : withoutScheme;
            return handle || null;
        };

        // 4) Save to gallery_info with real columns populated
        await step.do("save-gallery-info", async () => {
            const galleryInfoData: GalleryInfoInsert = {
                gallery_id: galleryId,
                name: result.name ?? null,
                about: result.about ?? null,
                address: result.address ?? null,
                email: result.email ?? null,
                phone: result.phone ?? null,
                instagram: normalizeInstagramHandle(result.instagram ?? undefined),
                tags: result.tags ?? null,
                data: result,
                updated_at: new Date().toISOString(),
            };
            console.log(`[ExtractGallery] Saving gallery_info: name="${galleryInfoData.name}", email="${galleryInfoData.email}", instagram="${galleryInfoData.instagram}"`);
            const { error } = await supabase.from("gallery_info").upsert([galleryInfoData], { onConflict: "gallery_id" });
            if (error) {
                console.error(`[ExtractGallery] Failed to save gallery_info:`, error);
                throw error;
            }
            console.log(`[ExtractGallery] Successfully saved gallery_info for gallery ${galleryId}`);
        });

        // 5) Save gallery hours
        await step.do("save-gallery-hours", async () => {
            if (result.hours && result.hours.length > 0) {
                console.log(`[ExtractGallery] Saving ${result.hours.length} gallery hours`);
                const hours: GalleryHoursInsert[] = result.hours.map(h => ({
                    gallery_id: galleryId,
                    dow: h.dow,
                    open_time: h.open_time,
                    close_time: h.close_time,
                }));

                const { error } = await supabase.from("gallery_hours").upsert(hours, { onConflict: "gallery_id,dow" });
                if (error) throw error;
                console.log(`[ExtractGallery] Saved gallery hours`);
            } else {
                console.log(`[ExtractGallery] No hours to save`);
            }
        });

        console.log(`[ExtractGallery] Complete - gallery ${galleryId} extracted and saved`);
        return { ok: true as const };
    }
}
