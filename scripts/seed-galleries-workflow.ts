import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

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

interface SeedGalleryPayload {
  mainUrl: string;
  aboutUrl?: string | null;
  eventsUrl?: string | null;
}

async function seedGallery(apiUrl: string, payload: SeedGalleryPayload): Promise<string> {
  const response = await fetch(`${apiUrl}/api/galleries/seed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const result = await response.json();
  return result.id;
}

async function seedGalleriesFromCSV(csvPath: string, apiUrl: string) {
  // Read and parse CSV
  const fileContent = readFileSync(csvPath, "utf-8");
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CSVRow[];

  console.log(`Found ${records.length} galleries to seed`);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const [index, row] of records.entries()) {
    const name = row.gallery_name || "Unknown";
    console.log(`\n[${index + 1}/${records.length}] Processing: ${name}`);

    // Skip if no homepage URL (required field)
    if (!row.gallery_homepage || row.gallery_homepage.trim() === "") {
      console.log(`  ⊘ Skipped: No homepage URL`);
      skippedCount++;
      continue;
    }

    try {
      const payload: SeedGalleryPayload = {
        mainUrl: row.gallery_homepage,
        aboutUrl: row.gallery_about && row.gallery_about.trim() !== "" ? row.gallery_about : null,
        eventsUrl: row.gallery_event && row.gallery_event.trim() !== "" ? row.gallery_event : null,
      };

      const workflowId = await seedGallery(apiUrl, payload);
      console.log(`  ✓ Workflow triggered: ${workflowId}`);
      console.log(`    Main: ${payload.mainUrl}`);
      if (payload.aboutUrl) console.log(`    About: ${payload.aboutUrl}`);
      if (payload.eventsUrl) console.log(`    Events: ${payload.eventsUrl}`);

      successCount++;
    } catch (error) {
      errorCount++;
      console.error(`  ✗ Error triggering workflow: ${error}`);
    }
  }

  console.log(`\n=== Seeding Complete ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total: ${records.length}`);
  console.log(`\nNote: Galleries are being processed in the background by Cloudflare Workers.`);
  console.log(`Pages will be created and automatically scraped for each gallery.`);
}

// Main execution
const csvPath = process.argv[2];
const apiUrl = process.argv[3];

if (!csvPath || !apiUrl) {
  console.error("Usage: bun run scripts/seed-galleries-workflow.ts <path-to-csv> <worker-api-url>");
  console.error("\nExample:");
  console.error("  bun run scripts/seed-galleries-workflow.ts scripts/my.csv https://your-worker.workers.dev");
  process.exit(1);
}

seedGalleriesFromCSV(csvPath, apiUrl)
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });
