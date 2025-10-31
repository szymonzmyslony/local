import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { createOpenAI } from "@ai-sdk/openai";
import {
    extractGalleryInfoFromMarkdown,
    getGalleryWithInfo,
    getPageMarkdownBulk,
    getServiceClient,
    selectPagesByGallery,
    upsertGalleryHours,
    upsertGalleryInfo
} from "@shared";
import type { GalleryInfoInsert, GalleryHoursInsert, Page } from "@shared";

type Params = { galleryId: string };

export class ExtractGallery extends WorkflowEntrypoint<Env, Params> {
    async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
        const { galleryId } = event.payload;
        const supabase = getServiceClient(this.env);
        const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });

        console.log(`[ExtractGallery] Starting - gallery ${galleryId}`);

        // Idempotency check: Skip if already extracted, but also get seeded address
        const existingGallery = await step.do("check-if-already-extracted", async (): Promise<{ gallery_info?: { about?: string | null; email?: string | null; address?: string | null } | null } | null> => {
            const gallery = await getGalleryWithInfo(supabase, galleryId);
            // Return only the fields we need to check
            return gallery ? { gallery_info: gallery.gallery_info } : null;
        });

        if (existingGallery?.gallery_info?.about || existingGallery?.gallery_info?.email) {
            console.log(`[ExtractGallery] Gallery ${galleryId} already has extracted data (about="${existingGallery.gallery_info.about?.substring(0, 50)}...", email="${existingGallery.gallery_info.email}"), skipping extraction`);

            // Still trigger embedding workflow in case it hasn't been done
            await step.do("trigger-embedding", async () => {
                console.log(`[ExtractGallery] Triggering embedding for gallery ${galleryId}`);
                await this.env.EMBEDDING.create({ params: { galleryIds: [galleryId] } });
            });

            return { ok: true as const, skipped: true };
        }

        const seededAddress = existingGallery?.gallery_info?.address ?? null;
        console.log(`[ExtractGallery] No existing extraction found, proceeding with extraction. Seeded address: ${seededAddress ?? "none"}`);

        // 1) Load gallery pages (main, about)
        const pages = await step.do("load-gallery-pages", async () => {
            const rows = await selectPagesByGallery(supabase, galleryId);
            const filtered = rows.filter((row): row is Page => row.kind === "gallery_main" || row.kind === "gallery_about");
            console.log(`[ExtractGallery] Loaded ${filtered.length} gallery pages`);
            const expectedKinds = new Set<"gallery_main" | "gallery_about">(["gallery_main", "gallery_about"]);
            const presentKinds = new Set(filtered.map(p => p.kind as "gallery_main" | "gallery_about"));
            const missingKinds = [...expectedKinds].filter(kind => !presentKinds.has(kind));
            const unexpectedKinds = rows
                .filter(row => row.kind !== "gallery_main" && row.kind !== "gallery_about")
                .map(row => row.kind);
            console.log(`[ExtractGallery] Expected kinds: ${[...expectedKinds].join(", ")} | Present kinds: ${[...presentKinds].join(", ") || "none"}`);
            if (missingKinds.length > 0) {
                console.log(`[ExtractGallery] Missing expected kinds: ${missingKinds.join(", ")}`);
            }
            if (unexpectedKinds.length > 0) {
                console.log(`[ExtractGallery] Unexpected kinds encountered: ${unexpectedKinds.join(", ")}`);
            }
            if (!filtered.length) {
                console.log("[ExtractGallery] No gallery pages found; ensure SeedGallery ran successfully.");
            } else {
                filtered.forEach(p => {
                    console.log(`[ExtractGallery] Page ${p.id} kind=${p.kind} url=${p.url ?? p.normalized_url}`);
                });
            }
            return filtered;
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
            const contentByPage = await getPageMarkdownBulk(supabase, pageIds);

            const mainPage = pages.find(p => p.kind === "gallery_main");
            const aboutPage = pages.find(p => p.kind === "gallery_about");

            const mainMd = mainPage ? contentByPage.get(mainPage.id) ?? "" : "";
            const aboutMd = aboutPage ? contentByPage.get(aboutPage.id) ?? "" : "";
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
            extractGalleryInfoFromMarkdown(openai, combinedMd, primaryUrl, seededAddress)
        );

        console.log(`[ExtractGallery] Extracted gallery ${primaryUrl}: ${result.about ?? 'unnamed'}`);


        // 4) Save to gallery_info with real columns populated
        await step.do("save-gallery-info", async () => {
            const galleryInfoData: GalleryInfoInsert = {
                gallery_id: galleryId,
                about: result.about ?? null,
                address: seededAddress ?? null, // Preserve seeded address
                email: result.email ?? null,
                phone: result.phone ?? null,
                district: result.district ?? null,
                tags: result.tags ?? null,
                data: result,
                updated_at: new Date().toISOString(),
            };
            console.log(`[ExtractGallery] Saving gallery_info payload (email="${galleryInfoData.email}", district="${galleryInfoData.district}", address="${galleryInfoData.address}")`);
            await upsertGalleryInfo(supabase, galleryInfoData);
            console.log(`[ExtractGallery] Successfully saved gallery_info for gallery ${galleryId}`);
        });

        // Trigger embedding workflow to create embeddings from extracted data
        await step.do("trigger-embedding", async () => {
            console.log(`[ExtractGallery] Triggering embedding for gallery ${galleryId}`);
            await this.env.EMBEDDING.create({ params: { galleryIds: [galleryId] } });
        });

        console.log(`[ExtractGallery] Complete - gallery ${galleryId} extracted and saved`);
        return { ok: true as const };
    }
}
