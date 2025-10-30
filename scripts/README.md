# Gallery Import Scripts

## seed-and-startup-galleries.ts (Recommended - Full Pipeline)

A TypeScript script that runs the complete gallery startup pipeline from start to finish. This is the most comprehensive approach as it:
- Seeds the gallery (creates records, pages)
- Scrapes all pages
- Extracts gallery information with AI
- Creates embeddings for search
- All automated in a single workflow!

### Usage

```bash
bun run scripts/seed-and-startup-galleries.ts <path-to-csv> <worker-api-url>
```

Example:
```bash
bun run scripts/seed-and-startup-galleries.ts scripts/my.csv http://localhost:8787
```

### What it does

1. Reads the CSV file
2. For each gallery with a homepage URL:
   - Triggers the `SeedAndStartupGallery` workflow which:
     - Seeds the gallery (creates `galleries`, `gallery_info`, and `pages` records)
     - Triggers scraping for all pages
     - Waits ~45 seconds for scraping to complete
     - Extracts gallery information using AI
     - Creates embeddings for search
3. Returns workflow IDs for tracking

**Timeline**: Each gallery takes approximately 45-60 seconds to complete the full pipeline.

**Note**: This is the recommended approach for new galleries as it handles the entire process automatically.

---

## seed-galleries-workflow.ts

A TypeScript script that reads a CSV file and triggers Cloudflare Worker workflows to seed galleries. This is the recommended approach as it:
- Automatically creates gallery records and gallery_info
- Creates and links pages (main, about, events) to the gallery
- Automatically triggers scraping for all pages
- Processes everything asynchronously in Cloudflare Workers

### Usage

```bash
bun run scripts/seed-galleries-workflow.ts <path-to-csv> <worker-api-url>
```

Example:
```bash
bun run scripts/seed-galleries-workflow.ts scripts/my.csv https://your-worker.workers.dev
```

### What it does

1. Reads the CSV file
2. For each gallery with a homepage URL:
   - Calls the `/api/galleries/seed` endpoint with mainUrl, aboutUrl (if present), and eventsUrl (if present)
   - The workflow creates:
     - A `galleries` record
     - A `gallery_info` record
     - `pages` records for main, about (if provided), and events (if provided)
     - Automatically triggers scraping for all pages
3. Returns workflow IDs for tracking

---

## extract-galleries.ts

Triggers the extraction workflow for galleries that have already been seeded and scraped. This workflow:
- Extracts structured data (about, email, phone, tags) from scraped markdown pages
- Automatically triggers the embedding workflow after extraction

### Usage

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the extract script
bun run scripts/extract-galleries.ts scripts/my.csv http://localhost:8787
```

### What it does

1. Reads the CSV file
2. For each gallery with a homepage URL:
   - Looks up the gallery ID in the database by matching the normalized URL
   - Calls `/api/galleries/extract` endpoint with the gallery ID
   - The workflow:
     - Reads markdown from `gallery_main` and `gallery_about` pages
     - Uses AI to extract structured data
     - Updates `gallery_info` with extracted data
     - **Automatically triggers embedding workflow**
3. Prints progress and results

**Note**: This script requires galleries to be already seeded and scraped. Run `seed-galleries-workflow.ts` first.

---

## import-galleries.ts

A simpler TypeScript script to directly import galleries and gallery information from a CSV file into the database (without creating pages or triggering scrapes).

---

## CSV Format (for both scripts)

The CSV file should have the following columns:

- `gallery_name` - The name of the gallery
- `gallery_homepage` - The main URL of the gallery website (required)
- `gallery_event` - The URL of the gallery's events/exhibitions page
- `gallery_about` - The URL of the gallery's about page
- `address` - The physical address of the gallery
- `opening_hours` - Opening hours (currently not imported to database)
- `instagram` - The Instagram handle of the gallery
- `facebook` - Facebook URL (not used by either script)
- `manually checked` - Check mark field (not used by either script)

See `my.csv` for an example.

**seed-galleries-workflow.ts** uses:
- gallery_homepage (as mainUrl - required)
- gallery_about (as aboutUrl - optional)
- gallery_event (as eventsUrl - optional)

**import-galleries.ts** uses:
- gallery_name, gallery_homepage, gallery_event, gallery_about, address, instagram

Rows without a `gallery_homepage` will be automatically skipped by both scripts.

---

## import-galleries.ts Details

### Environment Variables

Set the following environment variables before running:

- `SUPABASE_URL` - Your Supabase project URL (required)
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` - Your Supabase API key (one required)

### Usage

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Run the import script with your CSV file
bun run scripts/import-galleries.ts scripts/my.csv
```

### What it does

1. Reads the CSV file
2. For each row:
   - Creates/updates a `galleries` record with the homepage, events page, and about page URLs
   - Creates/updates a `gallery_info` record with the name, address, and Instagram handle
3. Prints progress and results

The script uses upsert operations, so running it multiple times with the same data is safe (it will update existing records based on the normalized URL).
