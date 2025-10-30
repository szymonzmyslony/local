import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { getServiceClient } from "../packages/shared/src/database/client";
import { normalizeUrl } from "../packages/shared/src/utils/normalizeUrl";

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

async function triggerExtract(apiUrl: string, galleryId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/galleries/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ galleryId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const result = await response.json();
  return result.id;
}

async function extractGalleriesFromCSV(csvPath: string, apiUrl: string) {
  // Initialize Supabase client to look up gallery IDs
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

  console.log(`Found ${records.length} galleries in CSV`);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [index, row] of records.entries()) {
    const name = row.gallery_name || "Unknown";
    console.log(`\n[${index + 1}/${records.length}] Processing: ${name}`);

    // Skip if no homepage URL
    if (!row.gallery_homepage || row.gallery_homepage.trim() === "") {
      console.log(`  ⊘ Skipped: No homepage URL`);
      skippedCount++;
      continue;
    }

    try {
      // Look up gallery ID by normalized URL
      const normalizedUrl = normalizeUrl(row.gallery_homepage);
      const { data, error } = await supabase
        .from("galleries")
        .select("id")
        .eq("normalized_main_url", normalizedUrl)
        .maybeSingle();

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        console.log(`  ⊘ Skipped: Gallery not found in database (${normalizedUrl})`);
        skippedCount++;
        continue;
      }

      const galleryId = data.id;
      console.log(`  ✓ Found gallery ID: ${galleryId}`);

      // Trigger extract workflow
      const workflowId = await triggerExtract(apiUrl, galleryId);
      console.log(`  ✓ Extract workflow triggered: ${workflowId}`);

      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`  ✗ Error: ${error}`);
    }
  }

  console.log(`\n=== Extract Complete ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${records.length}`);
  console.log(`\nNote: Extract workflows are running in the background.`);
  console.log(`They will automatically trigger embedding workflows when complete.`);
}

// Main execution
const csvPath = process.argv[2];
const apiUrl = process.argv[3];

if (!csvPath || !apiUrl) {
  console.error("Usage: bun run scripts/extract-galleries.ts <path-to-csv> <worker-api-url>");
  console.error("\nExample:");
  console.error("  bun run scripts/extract-galleries.ts scripts/my.csv http://localhost:8787");
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

extractGalleriesFromCSV(csvPath, apiUrl)
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });
