# Vite Dev Server Issue Investigation

## Problem Statement
`bun run start` (which runs `vite dev`) crashes with the following error after the server starts:

```
SyntaxError: Invalid or unexpected token
    at Object.runInlinedModule (workers/runner-worker.js:1403:35)
    at CustomModuleRunner.directRequest (workers/runner-worker.js:1206:80)
    ...
    at getWorkerEntryExport (workers/runner-worker.js:1427:17)
```

The error occurs when the Cloudflare Vite plugin's worker runtime tries to execute the bundled worker code. The server starts successfully at `http://localhost:5173/` but crashes ~10-15 seconds later when the worker is accessed.

## Working State
**Commit: `ea4fea067caf8373e03ef64816eec7ea3296ae85` (Nov 8, 2025)**
- `bun run start` works perfectly with hot reloading
- This commit contains Unicode characters (em-dashes —, ellipses …, Polish characters like "Hoża" → "Śródmieście") in source code
- Uses `@cloudflare/vite-plugin@^1.13.12`
- Has the following vite.config.ts:

```typescript
export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@shared/ui": path.resolve(__dirname, "../../packages/shared/src/ui"),
      "@gallery-agents/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@gallery-agents/shared/ui": path.resolve(__dirname, "../../packages/shared/src/ui")
    }
  }
});
```

## ROOT CAUSE IDENTIFIED ✅
**Date: November 11, 2025**

### The Problem
**Inline source maps are being embedded in transpiled code as base64 strings**, causing "SyntaxError: Invalid or unexpected token" when the Cloudflare worker runtime tries to execute the code.

### Error Details
```
SyntaxError: Invalid or unexpected token
    at Object.runInlinedModule (workers/runner-worker.js:1403:35)
    at CustomModuleRunner.directRequest (workers/runner-worker.js:1206:80)
```

This happens when accessing `http://localhost:5173/` after Vite starts, because the worker runtime tries to execute code containing raw base64 source map data.

### How It Was Found
Added debug logging to `node_modules/@cloudflare/vite-plugin/dist/workers/runner-worker.js` to inspect the actual transformed code being executed:

```javascript
console.error("Last 500 chars:", transformed.substring(Math.max(0, transformed.length - 500)));
```

**Output revealed:**
```
Last 500 chars: ...XcgVVJMKFwiL2luZGV4Lmh0bWxcIiwgdXJsLm9yaWdpbiksIHJlcXVlc3QpXG4gICAgICAgICk7...ifQ==
```

The `ifQ==` is the end of a base64-encoded inline source map (`//# sourceMappingURL=data:application/json;base64,...`) being included directly in the code string, which JavaScript cannot parse.

### The Fix
**Patch the Cloudflare Vite plugin** to strip inline source map comments before executing:

**File:** `node_modules/@cloudflare/vite-plugin/dist/workers/runner-worker.js`
**Location:** Line ~1401-1407

```javascript
async runInlinedModule(context, transformed, module) {
    // Strip inline source map comments that cause syntax errors
    const cleanedTransformed = transformed.replace(/\/\/# sourceMappingURL=data:application\/json[^"'\s]*$/gm, '');
    const code = `"use strict";async (${Object.keys(context).join(",")})=>{${cleanedTransformed}}`;
    await env.__VITE_UNSAFE_EVAL__.eval(code, module.id)(...Object.values(context));
  Object.seal(context[ssrModuleExportsKey]);
},
```

### Permanent Fix in Repo (Nov 12, 2025)
- Added a `stripInlineSourceMapsDuringServe` Vite plugin in `apps/app/vite.config.ts` that removes inline `//# sourceMappingURL=data:application/json;base64,...` comments from all SSR transforms during `vite dev`.
- This mirrors the manual patch above but keeps the workaround under version control, so no direct edits in `node_modules` are needed.
- Run `bun run start` after updating; the dev server should stay up (verify by loading `http://localhost:5173/` in a browser once the server prints ready).
- `cloudflare({ inspectorPort: false })` was also set so the plugin doesn’t attempt to open a local inspector port when running inside restricted environments.


### Why This Started Happening
- Something changed in Vite 7.x or TypeScript/esbuild configuration that started generating inline source maps for SSR code
- The Cloudflare Vite plugin's dev runtime doesn't handle inline source maps correctly
- The base64 source map data gets treated as JavaScript code, causing syntax errors

### Alternative Solutions (untested)
1. Configure Vite to not generate inline source maps for SSR environment
2. Upgrade to newer `@cloudflare/vite-plugin` version if available (may have fix)
3. File a bug report with Cloudflare Vite plugin maintainers

### Notes About "Working" Commit
Commit `ea4fea0` also crashes, but with a DIFFERENT error:
```
TypeError: Cannot read properties of undefined (reading 'idFromName')
    at routePartykitRequest (partyserver/src/index.ts:190:28)
```
This suggests the source map issue may have existed before but manifested differently, or environment changed.

## Previous Investigation Attempts (Did Not Fix Issue)
**Branch: `search-logic` (HEAD)**
- Removing all Unicode characters from source code
- Restoring the original vite.config.ts with all aliases
- Downgrading `@cloudflare/vite-plugin` from 1.14.0 to 1.13.12
- Using the exact same bun.lockb from "working" commit
- Reinstalling all dependencies
- Clearing `.wrangler` and `node_modules/.vite` cache
- Git stash and clean checkout
- Adding `build.sourcemap: false` to vite.config.ts (only affects production builds)

## Investigation Attempts

### 1. Unicode Character Hypothesis (DISPROVEN)
**Tried:** Removed all non-ASCII characters from source files
- Replaced em-dashes (—) with hyphens (-)
- Replaced ellipses (…) with periods (...)
- Replaced Polish characters (ó, ł, Ś, ą, ż) with ASCII equivalents
- Removed checkmarks (✓) and arrows (→)

**Files modified:**
- `apps/app/src/server.ts` - system prompt simplified
- `apps/app/src/tools.ts` - removed em-dashes
- `apps/app/src/components/chat.tsx` - "Mokotów" → "Mokotow"
- `apps/app/src/components/event-detail-popover.tsx` - removed arrows
- `apps/app/src/components/messages/tool-result.tsx` - removed checkmark
- `packages/shared/src/ai/content.ts` - replaced Polish weekday names

**Result:** Still crashes with same error. **The Unicode characters are NOT the root cause** - the working commit had all these Unicode characters and worked fine.

### 2. Vite Config Hypothesis (PARTIALLY RELATED)
**Tried:** Removing alias paths from vite.config.ts
- Initially removed `@shared` and `@gallery-agents/shared` aliases
- This caused different module resolution issues
- Restoring the aliases from working commit didn't fix the issue

**Result:** Aliases are necessary but not the root cause.

### 3. Dependency Version Hypothesis
**Tried:**
- Downgraded `@cloudflare/vite-plugin` from 1.14.0 to 1.13.12 (version from working commit)
- Copied exact `bun.lockb` from working commit
- Ran `bun install` to get exact same dependency tree

**Result:** Still crashes. Dependency versions are not the cause.

### 4. Verification Test
**Test:** Checked out commit `ea4fea067caf8373e03ef64816eec7ea3296ae85` and ran `bun run start`

**Result:** ✅ Works perfectly - server runs stable with hot reloading

**This confirms:** Something in the code changes between `ea4fea0` and current `HEAD` broke the Cloudflare worker runtime.

## Error Analysis

### Error Location
The error occurs in:
```
workers/runner-worker.js:1403:35
-> Object.runInlinedModule
-> /worker-entry/virtual:cloudflare/worker-entry:4:1
```

This is the Cloudflare Vite plugin's development worker runtime trying to execute dynamically bundled worker code.

### Two Different Error Messages Observed

1. **Original error (with older plugin):**
```
SyntaxError: Invalid or unexpected token
```

2. **With newer plugin (1.14.0):**
```
SyntaxError: Unexpected token '', "�      "... is not valid JSON
    at JSON.parse (<anonymous>)
```
The "�" is the Unicode replacement character, suggesting the newer plugin version has JSON parsing issues with Unicode in dependencies.

### Built Worker Analysis
Checking `dist/app/assets/worker-entry-*.js` revealed Unicode characters from npm dependencies:
- Line 4833: em-dash (—) from unknown dependency
- Line 12383: ellipsis (…) from unknown dependency
- Line 52872: warning sign (⚠️) from unknown dependency
- Various Unicode from @supabase or other packages

However, the production build works fine - the issue is only with the development worker runtime.

## What Changed Between Working and Broken State

Files changed between `ea4fea0` and current `HEAD`:
- `apps/app/src/app.tsx`
- `apps/app/src/client.tsx`
- `apps/app/src/components/chat.tsx`
- `apps/app/src/components/chat/messages/tools/tool-preview.tsx`
- `apps/app/src/components/event-detail-popover.tsx`
- `apps/app/src/components/left-drawer.tsx`
- `apps/app/src/components/messages.tsx`
- `apps/app/src/components/messages/*.tsx` (multiple files)
- `apps/app/src/components/sidebar-layout.tsx`
- `apps/app/src/index.css`
- `apps/app/src/server.ts`
- `apps/app/src/shared.ts`
- `apps/app/src/tool-metadata.ts`
- `apps/app/src/tool-results.tsx`

**Note:** No changes to `package.json`, `vite.config.ts`, or `wrangler.jsonc` between working and broken state.

## Current State
- Package.json: `@cloudflare/vite-plugin@1.13.12`
- Vite: `7.1.9`
- Wrangler: `4.45.0`
- Node: `v25.1.0`
- Bun: `1.1.17`

## Workarounds
1. **✅ `bunx wrangler dev --local`** - Works perfectly with hot reloading
2. **✅ `bun run build && bunx wrangler dev`** - Production build works

## Next Steps to Find Root Cause
1. **Git bisect** between `ea4fea0` and `HEAD` to find exact breaking commit
2. **File-by-file comparison** of changes in each commit to identify the specific code change
3. **Binary search** - progressively revert changes until it works again
4. **Check for circular dependencies** or import issues introduced in recent commits
5. **Check for invalid TypeScript** that might be causing bundling issues

## Hypothesis
The issue is likely:
- A specific code pattern in one of the changed files that the Cloudflare worker runtime can't handle
- An import statement or module structure that causes the bundler to include problematic code
- A TypeScript construct that transpiles to invalid JavaScript for the worker runtime
- NOT related to Unicode characters (proven)
- NOT related to dependency versions (proven)
- NOT related to vite config (proven)

## Files to Investigate
Priority files to review for breaking changes:
1. `apps/app/src/server.ts` - Core worker file
2. `apps/app/src/tools.ts` - Imported by server
3. New files added: `tool-metadata.ts`, `tool-results.tsx`, `shared.ts`
4. Component restructuring in `messages/` directory

## Date
November 11, 2025
