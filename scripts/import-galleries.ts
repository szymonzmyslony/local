import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { getServiceClient } from "../packages/shared/src/database/client";
import { upsertGallery, upsertGalleryInfo } from "../packages/shared/src/data/galleries";
import type { GalleryInsert, GalleryInfoInsert } from "../packages/shared/src/types/common";

interface CSVRow {
  gallery_name: string;
  gallery_homepage: string;
  gallery_event: string;
  gallery_about: string;
  address: string;
  opening_hours: string;
  instagram: string;
  facebook: string;
  "manually checked": string;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash and www prefix
    return parsed.hostname.replace(/^www\./, "") + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url.toLowerCase().trim();
  }
}

async function importGalleries(csvPath: string) {
  // Initialize Supabase client
  const supabase = getServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  });

  // Read and parse CSV
  const fileContent = readFileSync(csvPath, "utf-8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CSVRow[];

  console.log(`Found ${records.length} galleries to import`);

  let successCount = 0;
  let errorCount = 0;

  for (const [index, row] of records.entries()) {
    try {
      console.log(`\n[${index + 1}/${records.length}] Processing: ${row.gallery_name}`);

      // Skip if no homepage URL (required field)
      if (!row.gallery_homepage || row.gallery_homepage.trim() === "") {
        console.log(`  ⊘ Skipped: No homepage URL`);
        continue;
      }

      // Prepare gallery record
      const galleryInsert: GalleryInsert = {
        main_url: row.gallery_homepage,
        normalized_main_url: normalizeUrl(row.gallery_homepage),
        events_page: row.gallery_event && row.gallery_event.trim() !== "" ? row.gallery_event : null,
        about_url: row.gallery_about && row.gallery_about.trim() !== "" ? row.gallery_about : null,
      };

      // Insert/update gallery
      const gallery = await upsertGallery(supabase, galleryInsert);
      console.log(`  ✓ Gallery created/updated: ${gallery.id}`);

      // Prepare gallery_info record
      const galleryInfoInsert: GalleryInfoInsert = {
        gallery_id: gallery.id,
        name: row.gallery_name && row.gallery_name.trim() !== "" ? row.gallery_name : null,
        address: row.address && row.address.trim() !== "" ? row.address : null,
        instagram: row.instagram && row.instagram.trim() !== "" ? row.instagram : null,
        data: {}, // Required field - empty object for now
      };

      // Insert/update gallery info
      await upsertGalleryInfo(supabase, galleryInfoInsert);
      console.log(`  ✓ Gallery info created/updated`);

      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`  ✗ Error processing gallery: ${error}`);
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${records.length}`);
}

// Main execution
const csvPath = process.argv[2];

if (!csvPath) {
  console.error("Usage: bun run scripts/import-galleries.ts <path-to-csv>");
  process.exit(1);
}

if (!process.env.SUPABASE_URL) {
  console.error("Error: SUPABASE_URL environment variable is required");
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
  console.error("Error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variable is required");
  process.exit(1);
}

importGalleries(csvPath)
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });
