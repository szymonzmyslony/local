# Zine Local gallery agents

Zine Local is a London-first art discovery system running on Cloudflare and Supabase. It combines an end-user web/WhatsApp agent, an agent-per-gallery observation service, a protected admin dashboard, and a public landing page.

The AI route is centralized through OpenRouter. Chat, extraction, and classification use OpenAI `gpt-5.6-luna`; semantic search uses `openai/text-embedding-3-small` through the same provider.

## Repository map

```text
apps/
  app/           browser chat and first-party Chat SDK WhatsApp ingress
  observer/      London scout, one Think agent per gallery, workflows and evals
  dash/          protected admin UI and legacy/manual ingestion workflows
  landing-page/  static public site
packages/
  shared/        OpenRouter provider, embeddings, Supabase clients, schemas and UI
supabase/
  migrations/    canonical schema, RLS and observer control-plane migrations
docs/
  architecture.md
scripts/         legacy/import utilities and the preserved Warsaw seed set
```

Read [docs/architecture.md](docs/architecture.md) for the data model, crawl strategy, security boundaries, schedules, evaluation results, and operational runbook.

## Local development

Prerequisites: Bun, a Cloudflare account with Browser Rendering/Run, and a Supabase project with the checked-in migrations applied.

```bash
bun install
cp apps/app/.dev.vars.example apps/app/.dev.vars
```

Set these secrets locally:

```dotenv
OPENROUTER_API_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OBSERVER_ADMIN_TOKEN=...
DASH_ADMIN_PASSWORD=...
```

WhatsApp is optional and fail-closed. It activates only when all four values exist:

```dotenv
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=...
```

Run each service in a separate terminal:

```bash
cd apps/app && bun run dev
cd apps/observer && bun run dev
cd apps/dash && bun run dev
cd apps/landing-page && bun run dev
```

## Quality checks

```bash
bun run typecheck
bun run test
bun run build
bun run lint
```

The observer test set is defined in `apps/observer/src/london-fixtures.ts`. Its protected `/internal/evaluate` endpoint compares `browser_markdown` and `http_html` with the same Luna extraction schema and writes results to `extraction_evaluations`.

## Deployment

Production endpoints:

- `https://zinelocal.com` — landing page
- `https://chat.zinelocal.com` — end-user chat and `/webhook`
- `https://admin.zinelocal.com` — protected admin dashboard
- `https://zine-observer.szymon-zmyslony.workers.dev` — observer health; internal routes require a bearer token

Deploy code with:

```bash
cd apps/observer && bun run deploy
cd apps/app && bun run deploy
cd apps/dash && bun run deploy
cd apps/landing-page && bun run deploy
```

Worker secrets are configured with `wrangler secret put`; never place service-role or admin credentials in `wrangler.jsonc`. GitHub Actions deploys all four services from `main` or `master`, while runtime Worker secrets remain managed in Cloudflare.

## Security model

- Browser code receives only the Supabase anon key.
- Service-role access exists only in the dashboard and observer Workers.
- RLS is enabled on every public table.
- Anonymous/authenticated roles can only read the published catalogue tables.
- Raw pages, source snapshots, candidates, evaluations, and run ledgers are service-only.
- The dashboard requires Basic auth; Cloudflare Access is the recommended next hardening layer.
- Observer control routes require `Authorization: Bearer $OBSERVER_ADMIN_TOKEN`.
- Source fetching is restricted to normalized, same-origin official gallery URLs.

## WhatsApp activation

The app uses the official `@chat-adapter/whatsapp` integration supplied through Chat SDK/Think. Configure Meta's callback as `https://chat.zinelocal.com/webhook`, subscribe to messages, and set the four WhatsApp secrets above. `/health` returns `whatsappConfigured: true` only when the complete credential set is present.
