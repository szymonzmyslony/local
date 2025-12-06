# Gallery Agents - Development Guide

A monorepo for gallery agent workers and shared libraries. This project includes a chat interface (browser + WhatsApp), an admin dashboard, and shared utilities.

## 📁 Project Structure

```
├── apps/
│   ├── app/          # Chat interface (browser + WhatsApp) - End-user facing
│   ├── dash/         # Admin dashboard - Manage galleries, events, pages
│   └── landing-page/ # Landing page (static)
├── packages/
│   └── shared/       # Shared code (UI components, database, AI utilities)
└── scripts/          # Utility scripts for seeding galleries
```

## 🚀 Quick Start

### Prerequisites

- **Bun** (package manager and runtime)
- **OpenAI API Key** (for chat functionality)
- **Cloudflare Account** (for deployment)

### Initial Setup

1. **Install dependencies:**

   ```bash
   bun install
   ```

2. **Set up environment variables:**

   Create `apps/app/.dev.vars`:

   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   ```

## 🛠️ Development

### Running Applications

You need **two terminal windows** to run both apps simultaneously:

#### Terminal 1: Chat Interface (`apps/app`)

```bash
cd apps/app
rm -rf .wrangler  # Clear cache before starting
bun run dev
```

**Access:** `http://localhost:5173` (check terminal for exact port)

#### Terminal 2: Admin Panel (`apps/dash`)

```bash
cd apps/dash
rm -rf .wrangler  # Clear cache before starting
bun run dev
```

**Access:** `http://localhost:5174` (or next available port)

### Restarting Applications

**Always clear Wrangler cache before restarting:**

```bash
# For chat interface
cd apps/app
rm -rf .wrangler
bun run dev

# For admin panel
cd apps/dash
rm -rf .wrangler
bun run dev
```

Or clear both at once from root:

```bash
rm -rf apps/app/.wrangler apps/dash/.wrangler
```

### Why Clear Cache?

The `.wrangler` directories contain cached worker runtime code. Clearing them prevents:

- Stale build artifacts causing conflicts
- Development server crashes
- Worker runtime errors

## 📱 Applications Overview

### 1. Chat Interface (`apps/app`)

**Purpose:** End-user chat agent UI for both browser and WhatsApp

**Features:**

- Browser-based chat interface
- WhatsApp integration via webhook (`/webhook`)
- AI-powered gallery and event search
- Conversation state management via Durable Objects

**Key Files:**

- `src/server.ts` - Worker entry point, handles web and WhatsApp routes
- `src/app.tsx` - Browser chat UI
- `src/tools.ts` - AI agent tools for searching galleries/events
- `src/services/whatsapp-api.ts` - WhatsApp API integration

**Development:**

```bash
cd apps/app
rm -rf .wrangler
bun run dev
```

### 2. Admin Dashboard (`apps/dash`)

**Purpose:** Admin interface for managing galleries, events, and pages

**Features:**

- Gallery management (seed, scrape, extract)
- Event editing and management
- Page discovery and classification
- Workflow management (scraping, embedding, extraction)

**Key Files:**

- `worker/index.ts` - Worker API endpoints
- `workflows/` - Cloudflare Workflows for async processing
- `src/routes/` - React Router pages

**Development:**

```bash
cd apps/dash
rm -rf .wrangler
bun run dev
```

### 3. Landing Page (`apps/landing-page`)

**Purpose:** Static landing page

**Development:**

```bash
cd apps/landing-page
bun run dev
```

## 🔧 Common Tasks

### Building All Apps

```bash
# Build everything
bun run build

# Build specific app
bun run build:app      # Chat interface
bun run build:dash     # Admin dashboard
bun run build:shared   # Shared package
```

### Type Checking

```bash
bun run typecheck
```

### Linting

```bash
bun run lint
```

### Testing

```bash
bun run test  # Runs tests for apps/app
```

## 📦 Shared Package (`packages/shared`)

Contains reusable code used across apps:

- **UI Components** (`src/ui/`) - React components (buttons, cards, dialogs, etc.)
- **Database** (`src/database/`) - Supabase client and vector search
- **AI Utilities** (`src/ai/`) - Content generation and embeddings
- **Data Access** (`src/data/`) - Database queries for galleries, events, pages
- **Types** (`src/types/`) - Shared TypeScript types

**Build shared package:**

```bash
cd packages/shared
bun run build
```

## 🗄️ Database & Scripts

### Seeding Galleries

See `scripts/README.md` for detailed instructions on importing galleries from CSV files.

**Quick example:**

```bash
bun run scripts/seed-and-startup-galleries.ts scripts/zine.csv http://localhost:8787
```

## 🐛 Troubleshooting

### Development Server Crashes

1. **Clear Wrangler cache:**

   ```bash
   rm -rf apps/app/.wrangler apps/dash/.wrangler
   ```

2. **Check environment variables:**
   - Ensure `apps/app/.dev.vars` exists with `OPENAI_API_KEY`

3. **Reinstall dependencies:**
   ```bash
   bun install
   ```

### Port Already in Use

If port 5173 is taken, Vite will automatically use the next available port. Check terminal output for the actual URL.

### Worker Runtime Errors

If you see "SyntaxError: Invalid or unexpected token":

- Clear `.wrangler` cache
- Restart the dev server
- See `apps/app/FINDING.md` for detailed troubleshooting

## 📚 Additional Documentation

- `apps/app/FINDING.md` - Troubleshooting guide for chat interface
- `scripts/README.md` - Gallery import scripts documentation
- `packages/shared/DESIGN_SYSTEM.md` - Design system documentation
- `.github/DEPLOYMENT.md` - Deployment instructions

## 🔑 Environment Variables

### Required for `apps/app`:

Create `apps/app/.dev.vars`:

```
OPENAI_API_KEY=your_key_here
```

### Optional (for scripts):

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## 🚢 Deployment

See `.github/DEPLOYMENT.md` for deployment instructions.

**Manual deployment:**

```bash
# Build all apps
bun run build

# Deploy specific app
cd apps/app && bun run deploy
cd apps/dash && bun run deploy
```

---

**Need help?** Check the troubleshooting section or review the app-specific documentation files.
