# 🏗️ Gallery Agents Refactoring Implementation Plan

## Overview
Transform the automated pipeline into a curator-controlled workflow with manual checkpoints. Implement incrementally, testing each stage in the dashboard.

**Philosophy**:
- 🔥 **Delete legacy code aggressively** - No backward compatibility needed
- 🎨 **Use shadcn/ui components** - Install via `bunx --bun shadcn@latest add <component>`
- ✅ **Test incrementally** - Each worker + dashboard feature before moving on

---

## 🎯 Architecture Summary

```
Crawler → Extract → Similarity → Cluster
  (auto)    ⛔ UI      ⛔ UI      ⛔ UI
            approval   trigger    merge
```

**Key Decisions**:
- Similarity threshold: UI slider (not stored in DB)
- Manual merge links: `similarity_score = 1.0` (curator confirmed)
- Cluster commit: Direct write to golden tables (no worker)

---

## Phase 1: Database Migration

### Migration: `20251028_add_similarity_config.sql`

```sql
-- Allow NULL similarity_score for manual curator merges
ALTER TABLE extracted_artist_links
  ALTER COLUMN similarity_score DROP NOT NULL;

ALTER TABLE extracted_gallery_links
  ALTER COLUMN similarity_score DROP NOT NULL;

ALTER TABLE extracted_event_links
  ALTER COLUMN similarity_score DROP NOT NULL;

-- Track who created link (system vs curator)
ALTER TABLE extracted_artist_links ADD COLUMN created_by TEXT DEFAULT 'system';
ALTER TABLE extracted_gallery_links ADD COLUMN created_by TEXT DEFAULT 'system';
ALTER TABLE extracted_event_links ADD COLUMN created_by TEXT DEFAULT 'system';

COMMENT ON COLUMN extracted_artist_links.similarity_score IS
  'NULL or <1.0 = system detected, 1.0 = curator confirmed';
```

**Test**: `bunx supabase db push && bunx supabase gen types typescript --local > src/types/database_types.ts`

---

## Phase 2: Extraction Worker (Already Done ✅)

**Changes**:
- ✅ Updated to use `extracted_*` tables
- ✅ Sets `review_status='pending_review'`
- ✅ Removed queue sends

**Test**: Start crawl, verify entities appear in `extracted_artists` table

---

## Phase 3: Extraction Dashboard

### 3.1 Install shadcn/ui Components

```bash
# Core components for this phase
bunx --bun shadcn@latest add table
bunx --bun shadcn@latest add badge
bunx --bun shadcn@latest add button
bunx --bun shadcn@latest add checkbox
bunx --bun shadcn@latest add select
bunx --bun shadcn@latest add dialog
bunx --bun shadcn@latest add input
```

### 3.2 Create Extracted Entities API

**File**: `src/workers/coordinator/src/routes/extracted.ts` (NEW)

```typescript
import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

// GET /api/extracted/artists?limit=50&offset=0&review_status=pending_review
export async function getExtractedEntities(request: Request, env: Env, type: string) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const status = url.searchParams.get("review_status");

  const sb = getServiceClient(env);
  let query = sb
    .from(`extracted_${type}s`)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("review_status", status);

  const { data, count, error } = await query;
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { data, count });
}

// PUT /api/extracted/artists/:id
export async function updateEntity(request: Request, env: Env, type: string, id: string) {
  const updates = await request.json();
  const sb = getServiceClient(env);

  const { data, error } = await sb
    .from(`extracted_${type}s`)
    .update({
      ...updates,
      review_status: "modified",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { data });
}

// DELETE /api/extracted/artists/:id
export async function deleteEntity(request: Request, env: Env, type: string, id: string) {
  const sb = getServiceClient(env);
  const { error } = await sb.from(`extracted_${type}s`).delete().eq("id", id);
  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { ok: true });
}

// POST /api/extracted/artists/bulk-status
export async function bulkUpdateStatus(request: Request, env: Env, type: string) {
  const { ids, review_status } = await request.json();
  const sb = getServiceClient(env);

  const { error } = await sb
    .from(`extracted_${type}s`)
    .update({ review_status, reviewed_at: new Date().toISOString() })
    .in("id", ids);

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { ok: true });
}
```

**Add to server.ts**:
```typescript
// DELETE old source-enhanced.ts routes entirely

if (path === "/extracted/artists" && method === "GET")
  return getExtractedEntities(request, env, "artist");
if (path.match(/^\/extracted\/artists\/([^\/]+)$/) && method === "PUT")
  return updateEntity(request, env, "artist", path.split("/")[3]);
if (path.match(/^\/extracted\/artists\/([^\/]+)$/) && method === "DELETE")
  return deleteEntity(request, env, "artist", path.split("/")[3]);
if (path === "/extracted/artists/bulk-status" && method === "POST")
  return bulkUpdateStatus(request, env, "artist");

// Repeat for galleries, events
```

### 3.3 Refactor ExtractionTab with shadcn/ui

**File**: `src/workers/coordinator/src/components/tabs/ExtractionTab.tsx`

**DELETE OLD CODE**: Remove entire existing implementation

**NEW IMPLEMENTATION**:
```tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ReviewStatus = "pending_review" | "approved" | "rejected" | "modified";

const statusColors: Record<ReviewStatus, string> = {
  pending_review: "bg-yellow-500",
  approved: "bg-green-500",
  rejected: "bg-red-500",
  modified: "bg-blue-500",
};

export function ExtractionTab() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("pending_review");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ["extracted", "artists", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (statusFilter !== "all") params.set("review_status", statusFilter);
      const res = await fetch(`/api/extracted/artists?${params}`);
      return res.json();
    },
  });

  const bulkUpdate = useMutation({
    mutationFn: async (status: ReviewStatus) => {
      await fetch("/api/extracted/artists/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, review_status: status }),
      });
    },
    onSuccess: () => {
      setSelectedIds([]);
      refetch();
    },
  });

  const deleteEntity = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/extracted/artists/${id}`, { method: "DELETE" });
    },
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-4">
      {/* Header with filters and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="modified">Modified</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-sm text-muted-foreground">
            {data?.count || 0} entities
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex gap-2">
            <Badge variant="outline">{selectedIds.length} selected</Badge>
            <Button size="sm" onClick={() => bulkUpdate.mutate("approved")}>
              ✓ Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulkUpdate.mutate("rejected")}>
              ✗ Reject
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={selectedIds.length === data?.data?.length}
                onCheckedChange={(checked) => {
                  setSelectedIds(checked ? data?.data?.map((e: any) => e.id) || [] : []);
                }}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Bio</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.data?.map((entity: any) => (
            <TableRow key={entity.id}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.includes(entity.id)}
                  onCheckedChange={(checked) => {
                    setSelectedIds(checked
                      ? [...selectedIds, entity.id]
                      : selectedIds.filter(id => id !== entity.id)
                    );
                  }}
                />
              </TableCell>
              <TableCell>
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() => setEditingId(entity.id)}
                >
                  {entity.name}
                </button>
              </TableCell>
              <TableCell className="max-w-xs truncate">{entity.bio}</TableCell>
              <TableCell className="max-w-xs truncate">{entity.website}</TableCell>
              <TableCell>
                <Badge className={statusColors[entity.review_status as ReviewStatus]}>
                  {entity.review_status}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteEntity.mutate(entity.id)}
                >
                  🗑️
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit Dialog */}
      {editingId && (
        <EditEntityDialog
          entityId={editingId}
          onClose={() => {
            setEditingId(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function EditEntityDialog({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const [entity, setEntity] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/extracted/artists/${entityId}`)
      .then(r => r.json())
      .then(d => setEntity(d.data));
  }, [entityId]);

  const handleSave = async () => {
    await fetch(`/api/extracted/artists/${entityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entity),
    });
    onClose();
  };

  if (!entity) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Artist</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={entity.name}
              onChange={e => setEntity({ ...entity, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Bio</label>
            <Input
              value={entity.bio || ""}
              onChange={e => setEntity({ ...entity, bio: e.target.value })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Website</label>
            <Input
              value={entity.website || ""}
              onChange={e => setEntity({ ...entity, website: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Test**:
1. See entities in table with status badges
2. Edit entity name → status changes to "Modified"
3. Bulk select → Approve 3 entities
4. Filter by "Approved" → see only approved entities

---

## Phase 4: Similarity Worker + Trigger

### 4.1 Update messages.ts

**File**: `src/shared/messages.ts`

**DELETE**: All `Identity*` message types

**ADD**:
```typescript
export type SimilarityMessage = {
  type: "similarity.compute";
  entity_type: "artist" | "gallery" | "event";
  entity_id: string;
  threshold?: number; // Optional override from UI
};

export type SimilarityQueueMessage = SimilarityMessage;

// Update QueueMessage union
export type QueueMessage =
  | CrawlerQueueMessage
  | SourceQueueMessage
  | SimilarityQueueMessage;
```

### 4.2 Refactor Similarity Worker

**RENAME FOLDER**: `src/workers/identity/` → `src/workers/similarity/`

**File**: `src/workers/similarity/similarity.ts`

**DELETE**: Entire existing file

**NEW IMPLEMENTATION**:
```typescript
/// <reference path="./worker-configuration.d.ts" />

import { createEmbedder } from "@/shared/embedding";
import { jsonResponse } from "@/shared/http";
import type { SimilarityQueueMessage } from "@/shared/messages";
import { getServiceClient } from "@/shared/supabase";
import { toPgVector } from "@/shared/vector";

const DEFAULT_THRESHOLDS = { artist: 0.86, gallery: 0.86, event: 0.88 };

export default {
  async queue(batch: MessageBatch<SimilarityQueueMessage>, env: Env) {
    const sb = getServiceClient(env);
    const embedder = createEmbedder(env.OPENAI_API_KEY);

    for (const message of batch.messages) {
      try {
        const { entity_type, entity_id, threshold } = message.body;
        await computeSimilarity(
          sb,
          entity_type,
          entity_id,
          embedder,
          threshold || DEFAULT_THRESHOLDS[entity_type]
        );
        message.ack();
      } catch (error) {
        console.error("Similarity error:", error);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, SimilarityQueueMessage>;

async function computeSimilarity(
  sb: any,
  type: string,
  id: string,
  embedder: any,
  threshold: number
) {
  // 1. Fetch entity (must be approved)
  const { data: entity, error } = await sb
    .from(`extracted_${type}s`)
    .select("*")
    .eq("id", id)
    .eq("review_status", "approved")
    .single();

  if (error || !entity) {
    console.log(`Entity ${id} not approved, skipping`);
    return;
  }

  // 2. Compute embedding if not exists
  if (!entity.embedding) {
    const text = buildEmbeddingText(entity, type);
    const embedding = await embedder(text);
    await sb
      .from(`extracted_${type}s`)
      .update({ embedding: toPgVector(embedding) })
      .eq("id", id);
    entity.embedding = toPgVector(embedding);
  }

  // 3. Find similar entities
  const { data: similar } = await sb.rpc(`find_similar_${type}s`, {
    query_embedding: entity.embedding,
    match_threshold: threshold,
    match_count: 20,
  });

  // 4. Create similarity links
  for (const match of similar || []) {
    if (match.id === id) continue;

    const [a, b] = [id, match.id].sort();

    await sb.from(`extracted_${type}_links`).upsert({
      source_a_id: a,
      source_b_id: b,
      similarity_score: match.similarity,
      curator_decision: "pending",
      created_by: "system",
    }, { onConflict: "source_a_id,source_b_id" });
  }
}

function buildEmbeddingText(entity: any, type: string): string {
  if (type === "event") {
    return [entity.title, entity.description, entity.venue_name].filter(Boolean).join(" ");
  }
  return [entity.name, entity.bio, entity.website, ...(entity.socials || [])]
    .filter(Boolean)
    .join(" ");
}
```

**Update wrangler.jsonc**:
```jsonc
{
  "name": "citychat-similarity",
  "main": "similarity.ts",
  "queues": {
    "consumers": [{ "queue": "identity", "max_batch_size": 10 }]
  }
}
```

### 4.3 Add Trigger Similarity API

**Update coordinator wrangler.jsonc**:
```jsonc
{
  "queues": {
    "producers": [
      { "queue": "identity", "binding": "SIMILARITY_PRODUCER" }
    ]
  }
}
```

**File**: `src/workers/coordinator/src/routes/extracted.ts` (add)

```typescript
// POST /api/extracted/artists/trigger-similarity
export async function triggerSimilarity(request: Request, env: Env, type: string) {
  const { ids, threshold } = await request.json();
  const sb = getServiceClient(env);

  // Get approved entities
  let query = sb.from(`extracted_${type}s`).select("id").eq("review_status", "approved");
  if (ids?.length) query = query.in("id", ids);

  const { data } = await query;

  // Send to queue
  for (const entity of data || []) {
    await env.SIMILARITY_PRODUCER.send({
      type: "similarity.compute",
      entity_type: type,
      entity_id: entity.id,
      threshold,
    });
  }

  return jsonResponse(200, { queued: data?.length || 0 });
}
```

**Add to server.ts**:
```typescript
if (path === "/extracted/artists/trigger-similarity" && method === "POST")
  return triggerSimilarity(request, env, "artist");
```

### 4.4 Update ExtractionTab (Add Trigger UI)

**Install component**:
```bash
bunx --bun shadcn@latest add slider
```

**Add to ExtractionTab.tsx** (after bulk actions):
```tsx
const [threshold, setThreshold] = useState(0.86);

const triggerSimilarity = useMutation({
  mutationFn: async () => {
    await fetch("/api/extracted/artists/trigger-similarity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, threshold }),
    });
  },
  onSuccess: () => alert(`Queued ${selectedIds.length} for similarity check`),
});

// In JSX, add before table:
<div className="border p-4 rounded-lg space-y-2">
  <h3 className="font-semibold">Find Similar Entities</h3>
  <div className="flex items-center gap-4">
    <label className="text-sm">Threshold: {threshold.toFixed(2)}</label>
    <Slider
      value={[threshold]}
      onValueChange={([v]) => setThreshold(v)}
      min={0.7}
      max={0.99}
      step={0.01}
      className="w-48"
    />
    <Button
      onClick={() => triggerSimilarity.mutate()}
      disabled={selectedIds.length === 0}
    >
      🔍 Find Similar ({selectedIds.length})
    </Button>
  </div>
</div>
```

**Test**:
1. Approve 5 entities
2. Select them
3. Set threshold to 0.90
4. Click "Find Similar"
5. Check `extracted_artist_links` table for new rows

---

## Phase 5: Clustering Dashboard

### 5.1 Install Components

```bash
bunx --bun shadcn@latest add tabs
bunx --bun shadcn@latest add card
bunx --bun shadcn@latest add textarea
bunx --bun shadcn@latest add radio-group
```

### 5.2 Create Clustering APIs

**File**: `src/workers/coordinator/src/routes/cluster.ts` (NEW)

```typescript
import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

// GET /api/similarity/pairs?type=artist&min=0.85&max=0.95
export async function getSimilarityPairs(request: Request, env: Env) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "artist";
  const min = parseFloat(url.searchParams.get("min") || "0.85");
  const max = parseFloat(url.searchParams.get("max") || "0.95");

  const sb = getServiceClient(env);
  const { data, error } = await sb.rpc(`get_${type}_pairs_for_review`, {
    min_similarity: min,
    max_similarity: max,
    review_limit: 50,
  });

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { data });
}

// POST /api/similarity/dismiss
export async function dismissPair(request: Request, env: Env) {
  const { type, source_a_id, source_b_id } = await request.json();
  const sb = getServiceClient(env);

  const { error } = await sb
    .from(`extracted_${type}_links`)
    .update({ curator_decision: "dismissed", curator_decided_at: new Date().toISOString() })
    .eq("source_a_id", source_a_id)
    .eq("source_b_id", source_b_id);

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { ok: true });
}

// GET /api/extracted/search?type=artist&q=marina
export async function searchEntities(request: Request, env: Env) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "artist";
  const q = url.searchParams.get("q") || "";

  const sb = getServiceClient(env);
  const nameCol = type === "event" ? "title" : "name";

  const { data, error } = await sb
    .from(`extracted_${type}s`)
    .select("*")
    .ilike(nameCol, `%${q}%`)
    .is("cluster_id", null)
    .limit(20);

  if (error) return jsonResponse(500, { error: error.message });
  return jsonResponse(200, { data });
}

// POST /api/cluster/preview
export async function previewCluster(request: Request, env: Env) {
  const { type, entity_ids } = await request.json();
  const sb = getServiceClient(env);

  const { data: entities } = await sb
    .from(`extracted_${type}s`)
    .select("*")
    .in("id", entity_ids);

  // Aggregate field options
  const preview = {
    name: countFrequency(entities.map((e: any) => e.name || e.title)),
    bio: entities
      .filter((e: any) => e.bio)
      .map((e: any) => ({ value: e.bio, length: e.bio.length }))
      .sort((a, b) => b.length - a.length)
      .slice(0, 3),
    website: countFrequency(entities.map((e: any) => e.website).filter(Boolean)),
    socials: [...new Set(entities.flatMap((e: any) => e.socials || []))],
  };

  return jsonResponse(200, { preview });
}

function countFrequency(values: string[]) {
  const counts = new Map();
  values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || b.value.length - a.value.length);
}

// POST /api/cluster/commit
export async function commitCluster(request: Request, env: Env) {
  const { type, entity_ids, field_selections, created_by } = await request.json();
  const sb = getServiceClient(env);
  const cluster_id = crypto.randomUUID();

  try {
    // 1. Update extracted entities
    await sb.from(`extracted_${type}s`).update({ cluster_id }).in("id", entity_ids);

    // 2. Create similarity links (score = 1.0 for manual)
    for (let i = 0; i < entity_ids.length; i++) {
      for (let j = i + 1; j < entity_ids.length; j++) {
        const [a, b] = [entity_ids[i], entity_ids[j]].sort();
        await sb.from(`extracted_${type}_links`).upsert({
          source_a_id: a,
          source_b_id: b,
          similarity_score: 1.0, // Curator confirmed
          curator_decision: "merged",
          curator_decided_at: new Date().toISOString(),
          created_by: created_by || "manual",
        });
      }
    }

    // 3. Write golden record
    await sb.from(`golden_${type}s`).upsert({
      cluster_id,
      ...field_selections,
      updated_at: new Date().toISOString(),
    });

    // 4. Merge history
    await sb.from("merge_history").insert({
      cluster_id,
      entity_type: type,
      merged_source_ids: entity_ids,
      merge_type: "manual_cluster",
      field_selections,
      created_by,
    });

    return jsonResponse(200, { cluster_id });
  } catch (error: any) {
    return jsonResponse(500, { error: error.message });
  }
}
```

**Add to server.ts**:
```typescript
if (path === "/similarity/pairs" && method === "GET") return getSimilarityPairs(request, env);
if (path === "/similarity/dismiss" && method === "POST") return dismissPair(request, env);
if (path === "/extracted/search" && method === "GET") return searchEntities(request, env);
if (path === "/cluster/preview" && method === "POST") return previewCluster(request, env);
if (path === "/cluster/commit" && method === "POST") return commitCluster(request, env);
```

### 5.3 Create ClusteringTab Component

**File**: `src/workers/coordinator/src/components/tabs/ClusteringTab.tsx` (NEW)

**DELETE**: Old `IdentityTab.tsx` entirely

**NEW**:
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";

export function ClusteringTab() {
  return (
    <Tabs defaultValue="queue">
      <TabsList>
        <TabsTrigger value="queue">Curator Queue</TabsTrigger>
        <TabsTrigger value="manual">Manual Clustering</TabsTrigger>
      </TabsList>

      <TabsContent value="queue">
        <CuratorQueue />
      </TabsContent>

      <TabsContent value="manual">
        <ManualClustering />
      </TabsContent>
    </Tabs>
  );
}

function CuratorQueue() {
  const { data, refetch } = useQuery({
    queryKey: ["similarity-pairs"],
    queryFn: async () => {
      const res = await fetch("/api/similarity/pairs?type=artist&min=0.85&max=0.95");
      return res.json();
    },
  });

  const [mergeIds, setMergeIds] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Similar Entities ({data?.data?.length || 0})</h3>
      {data?.data?.map((pair: any) => (
        <Card key={`${pair.source_a_id}-${pair.source_b_id}`} className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <strong>{pair.source_a_name}</strong>
            </div>
            <div className="px-4 text-center">
              <div className="text-2xl font-bold">
                {(pair.similarity_score * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">match</div>
            </div>
            <div className="flex-1 text-right">
              <strong>{pair.source_b_name}</strong>
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              size="sm"
              onClick={() => setMergeIds([pair.source_a_id, pair.source_b_id])}
            >
              Merge
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await fetch("/api/similarity/dismiss", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "artist",
                    source_a_id: pair.source_a_id,
                    source_b_id: pair.source_b_id,
                  }),
                });
                refetch();
              }}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      ))}

      {mergeIds.length > 0 && (
        <MergePreviewModal
          entityIds={mergeIds}
          onClose={() => {
            setMergeIds([]);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function ManualClustering() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { data: results, refetch } = useQuery({
    queryKey: ["search", query],
    queryFn: async () => {
      if (!query) return { data: [] };
      const res = await fetch(`/api/extracted/search?type=artist&q=${query}`);
      return res.json();
    },
    enabled: query.length > 0,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search entities..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && refetch()}
        />
        <Button onClick={() => refetch()}>Search</Button>
      </div>

      <div className="grid gap-2">
        {results?.data?.map((entity: any) => (
          <Card
            key={entity.id}
            className={`p-3 cursor-pointer ${selected.includes(entity.id) ? "bg-blue-50" : ""}`}
            onClick={() => {
              setSelected(prev =>
                prev.includes(entity.id)
                  ? prev.filter(id => id !== entity.id)
                  : [...prev, entity.id]
              );
            }}
          >
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(entity.id)} readOnly />
              <div>
                <strong>{entity.name}</strong>
                <p className="text-sm text-muted-foreground truncate">
                  {entity.bio?.substring(0, 100)}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {selected.length >= 2 && (
        <Button onClick={() => setShowPreview(true)}>
          Preview Merge ({selected.length} selected)
        </Button>
      )}

      {showPreview && (
        <MergePreviewModal
          entityIds={selected}
          onClose={() => {
            setShowPreview(false);
            setSelected([]);
          }}
        />
      )}
    </div>
  );
}

function MergePreviewModal({ entityIds, onClose }: any) {
  const [preview, setPreview] = useState<any>(null);
  const [selections, setSelections] = useState<any>({});

  useEffect(() => {
    fetch("/api/cluster/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "artist", entity_ids: entityIds }),
    })
      .then(r => r.json())
      .then(d => {
        setPreview(d.preview);
        setSelections({
          name: d.preview.name[0]?.value,
          bio: d.preview.bio[0]?.value,
          website: d.preview.website[0]?.value,
          socials: d.preview.socials,
        });
      });
  }, []);

  const handleCommit = async () => {
    await fetch("/api/cluster/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "artist",
        entity_ids: entityIds,
        field_selections: selections,
        created_by: "curator@example.com",
      }),
    });
    alert("Cluster created!");
    onClose();
  };

  if (!preview) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge Preview ({entityIds.length} entities)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name field */}
          <div>
            <label className="font-medium">Name</label>
            <RadioGroup value={selections.name} onValueChange={v => setSelections({...selections, name: v})}>
              {preview.name.map((opt: any) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} />
                  <label>{opt.value} ({opt.count} sources)</label>
                </div>
              ))}
            </RadioGroup>
            <Input
              placeholder="Or enter custom..."
              className="mt-2"
              onChange={e => setSelections({...selections, name: e.target.value})}
            />
          </div>

          {/* Bio field */}
          <div>
            <label className="font-medium">Bio</label>
            <RadioGroup value={selections.bio} onValueChange={v => setSelections({...selections, bio: v})}>
              {preview.bio.map((opt: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} />
                  <label>{opt.length} characters</label>
                </div>
              ))}
            </RadioGroup>
            <Textarea
              placeholder="Or enter custom..."
              className="mt-2"
              onChange={e => setSelections({...selections, bio: e.target.value})}
            />
          </div>

          {/* Website field */}
          <div>
            <label className="font-medium">Website</label>
            <RadioGroup value={selections.website} onValueChange={v => setSelections({...selections, website: v})}>
              {preview.website.map((opt: any) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} />
                  <label>{opt.value} ({opt.count} sources)</label>
                </div>
              ))}
            </RadioGroup>
            <Input
              placeholder="Or enter custom..."
              className="mt-2"
              onChange={e => setSelections({...selections, website: e.target.value})}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCommit}>Commit Merge</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Update App.tsx**: Replace `<IdentityTab />` with `<ClusteringTab />`

**Test**:
1. Go to Clustering tab → Curator Queue
2. See auto-detected pairs
3. Click "Merge" → modal opens with field options
4. Select fields, commit
5. Verify `golden_artists` has new record
6. Go to Manual Clustering
7. Search "marina", select 2 entities
8. Preview merge, commit
9. Verify `extracted_artist_links` has `similarity_score = 1.0`

---

## Phase 6: Golden Tab (Verify)

**File**: `src/workers/coordinator/src/components/tabs/GoldenTab.tsx`

**Already exists** - just verify it works with new schema

**Test**: See merged golden records, drill down to see source entities

---

## Summary of Changes

### Files to DELETE:
- ❌ `src/workers/golden/` (entire directory)
- ❌ `src/workers/coordinator/src/routes/golden-enhanced.ts` (redundant)
- ❌ `src/workers/coordinator/src/routes/source-enhanced.ts` (redundant)
- ❌ `src/workers/coordinator/src/routes/identity-enhanced.ts` (redundant)
- ❌ `src/workers/coordinator/src/components/tabs/IdentityTab.tsx` (replaced)

### Files to RENAME:
- `src/workers/identity/` → `src/workers/similarity/`

### Files to CREATE:
- `supabase/migrations/20251028_add_similarity_config.sql`
- `src/workers/coordinator/src/routes/extracted.ts`
- `src/workers/coordinator/src/routes/cluster.ts`
- `src/workers/coordinator/src/components/tabs/ClusteringTab.tsx`

### Files to MODIFY:
- `src/workers/source/source.ts` (✅ already done)
- `src/workers/similarity/similarity.ts` (complete rewrite)
- `src/workers/coordinator/src/server.ts` (add routes)
- `src/workers/coordinator/src/components/tabs/ExtractionTab.tsx` (complete rewrite with shadcn)
- `src/shared/messages.ts` (rename identity → similarity)
- `src/workers/coordinator/wrangler.jsonc` (add SIMILARITY_PRODUCER)

---

## Implementation Order

1. ✅ Database migration
2. ✅ Extraction worker (done)
3. Extraction APIs
4. Extraction Dashboard (shadcn components)
5. Similarity worker refactor
6. Trigger similarity API
7. Clustering APIs
8. Clustering Dashboard (shadcn components)
9. End-to-end test

**Estimated Time**: ~6-8 hours for clean implementation
