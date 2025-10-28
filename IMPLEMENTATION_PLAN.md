# Curator Dashboard Refactor Plan

## Overview
Refactor the dashboard to support a hierarchical curator workflow: **Crawl Jobs → Pages (via discovered_urls) → Extracted Entities**, with bulk actions, inline editing, and per-job similarity review.

---

## Core Database Relationships

**Existing Schema (No Changes Needed)**:
```
crawl_jobs (id, seed_url, status, urls_discovered, urls_fetched)
    ↓ 1:N (via job_id)
discovered_urls (url, job_id, status, fetch_attempts)
    ↓ N:1 (via url match)
pages (url, md, extraction_status, fetched_at)
    ↓ 1:N (via page_url)
extracted_* tables (artists, galleries, events)
```

**Key Insight**: Use `discovered_urls` as the link between `crawl_jobs` and `pages`:
```sql
SELECT p.*, du.job_id
FROM pages p
INNER JOIN discovered_urls du ON p.url = du.url
WHERE du.job_id = $1
```

---

## Phase 1: Backend API - Hierarchical Queries

### 1.1 Crawl Job → Pages Endpoint

**File**: `src/workers/coordinator/src/routes/crawl.ts`

Add endpoint to get all pages for a crawl job via `discovered_urls`:

```typescript
// GET /api/crawl/jobs/{jobId}/pages
export async function getCrawlJobPages(jobId: string, env: Env): Promise<Response> {
  const sb = getServiceClient(env);

  // Join pages with discovered_urls to get pages for this job
  const { data: pages, error } = await sb
    .from("discovered_urls")
    .select(`
      url,
      status,
      pages!inner(
        url,
        extraction_status,
        fetched_at
      )
    `)
    .eq("job_id", jobId)
    .eq("status", "fetched");

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  // Get entity counts for each page
  const pageUrls = pages?.map(p => p.url) || [];
  const [artistCounts, galleryCounts, eventCounts] = await Promise.all([
    sb.from("extracted_artists").select("page_url", { count: "exact" }).in("page_url", pageUrls),
    sb.from("extracted_galleries").select("page_url", { count: "exact" }).in("page_url", pageUrls),
    sb.from("extracted_events").select("page_url", { count: "exact" }).in("page_url", pageUrls),
  ]);

  // Transform to include entity counts
  const pagesWithCounts = pages?.map(p => ({
    url: p.url,
    extraction_status: p.pages.extraction_status,
    fetched_at: p.pages.fetched_at,
    entity_counts: {
      artists: artistCounts?.filter(c => c.page_url === p.url).length || 0,
      galleries: galleryCounts?.filter(c => c.page_url === p.url).length || 0,
      events: eventCounts?.filter(c => c.page_url === p.url).length || 0,
    }
  }));

  return jsonResponse(200, { pages: pagesWithCounts, total: pages?.length || 0 });
}
```

### 1.2 Page → Entities Endpoint

**File**: `src/workers/coordinator/src/routes/pages.ts` (NEW)

```typescript
import { jsonResponse } from "@/shared/http";
import { getServiceClient } from "@/shared/supabase";

// GET /api/pages/:encodedUrl/entities
export async function getPageEntities(encodedUrl: string, env: Env): Promise<Response> {
  const url = decodeURIComponent(encodedUrl);
  const sb = getServiceClient(env);

  const [artists, galleries, events] = await Promise.all([
    sb.from("extracted_artists").select("*").eq("page_url", url),
    sb.from("extracted_galleries").select("*").eq("page_url", url),
    sb.from("extracted_events").select("*").eq("page_url", url),
  ]);

  return jsonResponse(200, {
    url,
    entities: {
      artists: artists.data || [],
      galleries: galleries.data || [],
      events: events.data || [],
    }
  });
}
```

### 1.3 Enhanced Extracted Entities Endpoint

**File**: `src/workers/coordinator/src/routes/extracted.ts`

Add filter params to existing endpoint:

```typescript
// GET /api/extracted/{type}?crawl_job_id=xxx&page_url=xxx&review_status=pending_review
export async function getExtractedEntities(
  entityType: "artist" | "gallery" | "event",
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const reviewStatus = url.searchParams.get("review_status");
  const pageUrl = url.searchParams.get("page_url");
  const crawlJobId = url.searchParams.get("crawl_job_id");

  const sb = getServiceClient(env);
  const tableName = `extracted_${entityType}s`;

  let query = sb
    .from(tableName)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (reviewStatus) {
    query = query.eq("review_status", reviewStatus);
  }

  if (pageUrl) {
    query = query.eq("page_url", pageUrl);
  }

  if (crawlJobId) {
    // Filter by crawl job: join through discovered_urls
    const { data: jobUrls } = await sb
      .from("discovered_urls")
      .select("url")
      .eq("job_id", crawlJobId);

    const urls = jobUrls?.map(u => u.url) || [];
    query = query.in("page_url", urls);
  }

  const { data, count, error } = await query;

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  return jsonResponse(200, { entities: data, total: count });
}
```

### 1.4 Bulk Approve by Page

**File**: `src/workers/coordinator/src/routes/extracted.ts`

```typescript
// POST /api/extracted/bulk-approve-by-page
export async function bulkApproveByPage(request: Request, env: Env): Promise<Response> {
  const { page_urls, entity_types, trigger_similarity, threshold } = await request.json();
  const sb = getServiceClient(env);

  let totalApproved = 0;
  const entityIds: Record<string, string[]> = {};

  // Approve all entities from specified pages
  for (const type of entity_types) {
    const tableName = `extracted_${type}s`;

    const { data: entities } = await sb
      .from(tableName)
      .update({
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .in("page_url", page_urls)
      .eq("review_status", "pending_review")
      .select("id");

    const ids = entities?.map(e => e.id) || [];
    entityIds[type] = ids;
    totalApproved += ids.length;

    // Queue for similarity if requested
    if (trigger_similarity && ids.length > 0) {
      for (const id of ids) {
        await env.SIMILARITY_PRODUCER.send({
          type: "similarity.compute",
          entity_type: type,
          entity_id: id,
          threshold,
        });
      }
    }
  }

  return jsonResponse(200, {
    approved: totalApproved,
    queued_for_similarity: trigger_similarity ? totalApproved : 0,
    entity_ids: entityIds,
  });
}
```

### 1.5 Similarity Pairs with Job Filter

**File**: `src/workers/coordinator/src/routes/similarity.ts`

```typescript
// GET /api/similarity/pairs/{type}?crawl_job_id=xxx&min_similarity=0.8&max_similarity=1.0
export async function getSimilarityPairs(
  entityType: "artist" | "gallery" | "event",
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const minSimilarity = parseFloat(url.searchParams.get("min_similarity") || "0.7");
  const maxSimilarity = parseFloat(url.searchParams.get("max_similarity") || "1.0");
  const crawlJobId = url.searchParams.get("crawl_job_id");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const sb = getServiceClient(env);

  // Get pairs from database function
  const { data: pairs, error } = await sb.rpc(`get_${entityType}_pairs_for_review`, {
    min_similarity: minSimilarity,
    max_similarity: maxSimilarity,
    review_limit: limit,
  });

  if (error) {
    return jsonResponse(500, { error: error.message });
  }

  // If job filter is specified, filter pairs where BOTH entities are from that job
  let filteredPairs = pairs;
  if (crawlJobId) {
    // Get URLs from this crawl job
    const { data: jobUrls } = await sb
      .from("discovered_urls")
      .select("url")
      .eq("job_id", crawlJobId);

    const urlSet = new Set(jobUrls?.map(u => u.url) || []);

    // Filter pairs where both entities are from this job's pages
    filteredPairs = pairs?.filter((pair: any) =>
      urlSet.has(pair.source_a_page_url) && urlSet.has(pair.source_b_page_url)
    );
  }

  return jsonResponse(200, { pairs: filteredPairs, total: filteredPairs?.length || 0 });
}
```

### 1.6 Update server.ts Routes

**File**: `src/workers/coordinator/src/server.ts`

Add new routes:

```typescript
// Crawl job pages
if (path.match(/^\/crawl\/jobs\/[^\/]+\/pages$/) && method === "GET") {
  const jobId = path.split("/")[3];
  return getCrawlJobPages(jobId, env);
}

// Page entities
if (path.match(/^\/pages\/.+\/entities$/) && method === "GET") {
  const encodedUrl = path.split("/")[2];
  return getPageEntities(encodedUrl, env);
}

// Bulk approve by page
if (path === "/extracted/bulk-approve-by-page" && method === "POST") {
  return bulkApproveByPage(request, env);
}
```

---

## Phase 2: Frontend Components - Shared UI

### 2.1 CrawlJobSelector Component

**File**: `src/workers/coordinator/src/components/common/CrawlJobSelector.tsx`

```typescript
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CrawlJobSelectorProps {
  value: string;
  onChange: (jobId: string) => void;
}

export function CrawlJobSelector({ value, onChange }: CrawlJobSelectorProps) {
  const { data: jobs } = useQuery({
    queryKey: ["crawl-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/crawl/jobs");
      const json = await res.json();
      return json.jobs;
    },
  });

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[300px]">
        <SelectValue placeholder="Select crawl job..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All Crawl Jobs</SelectItem>
        {jobs?.map((job: any) => (
          <SelectItem key={job.id} value={job.id}>
            {job.seed_url} ({job.status}) - {new Date(job.created_at).toLocaleDateString()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### 2.2 BulkActionsBar Component

**File**: `src/workers/coordinator/src/components/review/BulkActionsBar.tsx`

```typescript
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BulkActionsBarProps {
  selectedEntities: number;
  selectedPages: number;
  onApprove: () => void;
  onReject: () => void;
  onTriggerSimilarity: () => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedEntities,
  selectedPages,
  onApprove,
  onReject,
  onTriggerSimilarity,
  onClearSelection,
}: BulkActionsBarProps) {
  if (selectedEntities === 0 && selectedPages === 0) return null;

  return (
    <div className="sticky bottom-0 bg-white border-t p-4 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2">
        {selectedPages > 0 && <Badge variant="outline">{selectedPages} pages</Badge>}
        {selectedEntities > 0 && <Badge variant="outline">{selectedEntities} entities</Badge>}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClearSelection}>
          Clear Selection
        </Button>
        <Button variant="outline" size="sm" onClick={onReject}>
          Reject
        </Button>
        <Button variant="outline" size="sm" onClick={onApprove}>
          Approve
        </Button>
        <Button size="sm" onClick={onTriggerSimilarity}>
          Approve & Queue for Similarity
        </Button>
      </div>
    </div>
  );
}
```

### 2.3 PageNode Component

**File**: `src/workers/coordinator/src/components/review/PageNode.tsx`

```typescript
import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface PageNodeProps {
  url: string;
  entityCount: number;
  selected: boolean;
  onSelectPage: (selected: boolean) => void;
  children: React.ReactNode;
}

export function PageNode({ url, entityCount, selected, onSelectPage, children }: PageNodeProps) {
  const [expanded, setExpanded] = useState(false);

  const truncatedUrl = url.length > 60 ? url.substring(0, 60) + "..." : url;

  return (
    <div className="border rounded-lg mb-2">
      <div
        className="flex items-center gap-2 p-3 hover:bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onSelectPage}
          onClick={(e) => e.stopPropagation()}
        />

        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}

        <span className="font-mono text-sm flex-1">{truncatedUrl}</span>

        <Badge variant="secondary">{entityCount} entities</Badge>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 hover:text-blue-800"
        >
          <ExternalLink size={16} />
        </a>
      </div>

      {expanded && (
        <div className="border-t p-4 bg-gray-50">
          {children}
        </div>
      )}
    </div>
  );
}
```

### 2.4 EntityEditDialog Component

**File**: `src/workers/coordinator/src/components/review/EntityEditDialog.tsx`

```typescript
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface EntityEditDialogProps {
  entityType: "artist" | "gallery" | "event";
  entityId: string;
  onClose: () => void;
  onSave: () => void;
}

export function EntityEditDialog({ entityType, entityId, onClose, onSave }: EntityEditDialogProps) {
  const [entity, setEntity] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/extracted/${entityType}s/${entityId}`)
      .then(r => r.json())
      .then(data => {
        setEntity(data);
        setLoading(false);
      });
  }, [entityId, entityType]);

  const handleSave = async () => {
    await fetch(`/api/extracted/${entityType}s/${entityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entity),
    });
    onSave();
    onClose();
  };

  const handleQueueSimilarity = async () => {
    await handleSave();
    await fetch(`/api/extracted/${entityType}s/${entityId}/queue-similarity`, {
      method: "POST",
    });
    onClose();
  };

  if (loading || !entity) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {entityType}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={entity.name || entity.title || ""}
              onChange={e => setEntity({ ...entity, name: e.target.value })}
            />
          </div>

          {entityType !== "event" && (
            <>
              <div>
                <Label>Bio / Description</Label>
                <Textarea
                  value={entity.bio || entity.description || ""}
                  onChange={e => setEntity({ ...entity, bio: e.target.value })}
                  rows={4}
                />
              </div>

              <div>
                <Label>Website</Label>
                <Input
                  value={entity.website || ""}
                  onChange={e => setEntity({ ...entity, website: e.target.value })}
                />
              </div>
            </>
          )}

          {entityType === "event" && (
            <>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={entity.description || ""}
                  onChange={e => setEntity({ ...entity, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div>
                <Label>Venue</Label>
                <Input
                  value={entity.venue_name || ""}
                  onChange={e => setEntity({ ...entity, venue_name: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
            <Button onClick={handleQueueSimilarity}>
              Save & Queue for Similarity
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Phase 3: Frontend - ReviewTab (Hierarchical View)

### 3.1 HierarchicalEntityView Component

**File**: `src/workers/coordinator/src/components/review/HierarchicalEntityView.tsx`

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageNode } from "./PageNode";
import { EntityEditDialog } from "./EntityEditDialog";
import { BulkActionsBar } from "./BulkActionsBar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HierarchicalEntityViewProps {
  crawlJobId: string;
  entityType: "artist" | "gallery" | "event";
}

export function HierarchicalEntityView({ crawlJobId, entityType }: HierarchicalEntityViewProps) {
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [entitiesByPage, setEntitiesByPage] = useState<Record<string, any[]>>({});

  // Fetch pages for this crawl job
  const { data: pagesData, refetch: refetchPages } = useQuery({
    queryKey: ["crawl-job-pages", crawlJobId],
    queryFn: async () => {
      const res = await fetch(`/api/crawl/jobs/${crawlJobId}/pages`);
      return res.json();
    },
    enabled: !!crawlJobId,
  });

  // Fetch entities when a page is expanded
  const fetchPageEntities = async (pageUrl: string) => {
    const encoded = encodeURIComponent(pageUrl);
    const res = await fetch(`/api/pages/${encoded}/entities`);
    const data = await res.json();
    return data.entities[`${entityType}s`] || [];
  };

  const togglePage = async (pageUrl: string) => {
    if (expandedPages.has(pageUrl)) {
      setExpandedPages(prev => {
        const next = new Set(prev);
        next.delete(pageUrl);
        return next;
      });
    } else {
      setExpandedPages(prev => new Set(prev).add(pageUrl));

      // Fetch entities if not already loaded
      if (!entitiesByPage[pageUrl]) {
        const entities = await fetchPageEntities(pageUrl);
        setEntitiesByPage(prev => ({ ...prev, [pageUrl]: entities }));
      }
    }
  };

  const handleSelectPage = (pageUrl: string, checked: boolean) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(pageUrl);
      } else {
        next.delete(pageUrl);
        // Also deselect all entities from this page
        const pageEntityIds = entitiesByPage[pageUrl]?.map(e => e.id) || [];
        setSelectedEntities(prevEntities => {
          const nextEntities = new Set(prevEntities);
          pageEntityIds.forEach(id => nextEntities.delete(id));
          return nextEntities;
        });
      }
      return next;
    });
  };

  const handleSelectEntity = (entityId: string, checked: boolean) => {
    setSelectedEntities(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(entityId);
      } else {
        next.delete(entityId);
      }
      return next;
    });
  };

  const bulkApprove = useMutation({
    mutationFn: async (triggerSimilarity: boolean) => {
      const pageUrls = Array.from(selectedPages);
      await fetch("/api/extracted/bulk-approve-by-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_urls: pageUrls,
          entity_types: [entityType],
          trigger_similarity: triggerSimilarity,
          threshold: 0.85,
        }),
      });
    },
    onSuccess: () => {
      setSelectedPages(new Set());
      setSelectedEntities(new Set());
      refetchPages();
    },
  });

  const pages = pagesData?.pages || [];

  return (
    <div>
      <div className="space-y-2 mb-20">
        {pages.map((page: any) => (
          <PageNode
            key={page.url}
            url={page.url}
            entityCount={page.entity_counts[`${entityType}s`] || 0}
            selected={selectedPages.has(page.url)}
            onSelectPage={(checked) => handleSelectPage(page.url, checked)}
          >
            {/* Entity list */}
            <div className="space-y-2">
              {(entitiesByPage[page.url] || []).map((entity: any) => (
                <div key={entity.id} className="flex items-center gap-2 p-2 border rounded hover:bg-white">
                  <Checkbox
                    checked={selectedEntities.has(entity.id)}
                    onCheckedChange={(checked) => handleSelectEntity(entity.id, !!checked)}
                  />

                  <button
                    onClick={() => setEditingEntityId(entity.id)}
                    className="flex-1 text-left hover:text-blue-600"
                  >
                    <div className="font-medium">{entity.name || entity.title}</div>
                    <div className="text-sm text-gray-600 truncate">
                      {entity.bio || entity.description || entity.venue_name}
                    </div>
                  </button>

                  <Badge variant={
                    entity.review_status === "approved" ? "default" :
                    entity.review_status === "rejected" ? "destructive" :
                    "secondary"
                  }>
                    {entity.review_status}
                  </Badge>
                </div>
              ))}
            </div>
          </PageNode>
        ))}
      </div>

      <BulkActionsBar
        selectedEntities={selectedEntities.size}
        selectedPages={selectedPages.size}
        onApprove={() => bulkApprove.mutate(false)}
        onReject={() => {/* TODO */}}
        onTriggerSimilarity={() => bulkApprove.mutate(true)}
        onClearSelection={() => {
          setSelectedPages(new Set());
          setSelectedEntities(new Set());
        }}
      />

      {editingEntityId && (
        <EntityEditDialog
          entityType={entityType}
          entityId={editingEntityId}
          onClose={() => setEditingEntityId(null)}
          onSave={() => {
            // Refresh entities for affected pages
            Object.keys(entitiesByPage).forEach(async (pageUrl) => {
              const entities = await fetchPageEntities(pageUrl);
              setEntitiesByPage(prev => ({ ...prev, [pageUrl]: entities }));
            });
          }}
        />
      )}
    </div>
  );
}
```

### 3.2 ReviewTab (Renamed from ExtractionTab)

**File**: `src/workers/coordinator/src/components/tabs/ReviewTab.tsx`

```typescript
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrawlJobSelector } from "../common/CrawlJobSelector";
import { HierarchicalEntityView } from "../review/HierarchicalEntityView";

export function ReviewTab() {
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [entityType, setEntityType] = useState<"artist" | "gallery" | "event">("artist");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <CrawlJobSelector value={selectedJob} onChange={setSelectedJob} />
      </div>

      {selectedJob ? (
        <Tabs value={entityType} onValueChange={(v: any) => setEntityType(v)}>
          <TabsList>
            <TabsTrigger value="artist">Artists</TabsTrigger>
            <TabsTrigger value="gallery">Galleries</TabsTrigger>
            <TabsTrigger value="event">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="artist">
            <HierarchicalEntityView crawlJobId={selectedJob} entityType="artist" />
          </TabsContent>

          <TabsContent value="gallery">
            <HierarchicalEntityView crawlJobId={selectedJob} entityType="gallery" />
          </TabsContent>

          <TabsContent value="event">
            <HierarchicalEntityView crawlJobId={selectedJob} entityType="event" />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center text-gray-500 py-12">
          Select a crawl job to review extracted entities
        </div>
      )}
    </div>
  );
}
```

---

## Phase 4: Frontend - SimilarityTab (Renamed from IdentityTab)

### 4.1 SimilarityTab Component

**File**: `src/workers/coordinator/src/components/tabs/SimilarityTab.tsx`

```typescript
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CrawlJobSelector } from "../common/CrawlJobSelector";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SimilarityTab() {
  const [crawlJobFilter, setCrawlJobFilter] = useState<string>("");
  const [entityType, setEntityType] = useState<"artist" | "gallery" | "event">("artist");
  const [minScore, setMinScore] = useState(0.7);
  const [maxScore, setMaxScore] = useState(1.0);

  const { data: pairs, refetch } = useQuery({
    queryKey: ["similarity-pairs", entityType, minScore, maxScore, crawlJobFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        min_similarity: minScore.toString(),
        max_similarity: maxScore.toString(),
      });
      if (crawlJobFilter) {
        params.set("crawl_job_id", crawlJobFilter);
      }
      const res = await fetch(`/api/similarity/pairs/${entityType}s?${params}`);
      return res.json();
    },
  });

  const handleDismiss = async (linkId: string) => {
    await fetch(`/api/similarity/pairs/${linkId}/${entityType}/dismiss`, {
      method: "POST",
    });
    refetch();
  };

  const handleMarkMerge = async (linkId: string) => {
    await fetch(`/api/similarity/pairs/${linkId}/${entityType}/merge`, {
      method: "POST",
    });
    refetch();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <CrawlJobSelector value={crawlJobFilter} onChange={setCrawlJobFilter} />

        <div className="flex items-center gap-2">
          <label className="text-sm">Similarity:</label>
          <Slider
            value={[minScore, maxScore]}
            onValueChange={([min, max]) => {
              setMinScore(min);
              setMaxScore(max);
            }}
            min={0.5}
            max={1.0}
            step={0.01}
            className="w-48"
          />
          <span className="text-sm">{minScore.toFixed(2)} - {maxScore.toFixed(2)}</span>
        </div>
      </div>

      {/* Entity type tabs */}
      <Tabs value={entityType} onValueChange={(v: any) => setEntityType(v)}>
        <TabsList>
          <TabsTrigger value="artist">Artists</TabsTrigger>
          <TabsTrigger value="gallery">Galleries</TabsTrigger>
          <TabsTrigger value="event">Events</TabsTrigger>
        </TabsList>

        <TabsContent value={entityType}>
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              {pairs?.total || 0} similar pairs found
              {crawlJobFilter && " (filtered by crawl job)"}
            </div>

            {pairs?.pairs?.map((pair: any) => (
              <Card key={`${pair.source_a_id}-${pair.source_b_id}`} className="p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                  {/* Entity A */}
                  <div>
                    <div className="font-semibold">{pair.source_a_name || pair.source_a_title}</div>
                    <div className="text-sm text-gray-600 truncate">
                      {pair.source_a_bio || pair.source_a_description}
                    </div>
                  </div>

                  {/* Similarity Score */}
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {(pair.similarity_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-gray-500">similarity</div>
                  </div>

                  {/* Entity B */}
                  <div className="text-right">
                    <div className="font-semibold">{pair.source_b_name || pair.source_b_title}</div>
                    <div className="text-sm text-gray-600 truncate">
                      {pair.source_b_bio || pair.source_b_description}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDismiss(pair.link_id)}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleMarkMerge(pair.link_id)}
                  >
                    Mark for Merge
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## Phase 5: Update Main App

### 5.1 Update Tab Names and Imports

**File**: `src/workers/coordinator/src/App.tsx` (or main layout)

```typescript
// Replace imports
import { ReviewTab } from "./components/tabs/ReviewTab"; // was ExtractionTab
import { SimilarityTab } from "./components/tabs/SimilarityTab"; // was IdentityTab

// Update tab list
<Tabs>
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="crawls">Crawls</TabsTrigger>
    <TabsTrigger value="review">Review</TabsTrigger>  {/* was "extraction" */}
    <TabsTrigger value="similarity">Similarity</TabsTrigger>  {/* was "identity" */}
    <TabsTrigger value="golden">Golden</TabsTrigger>
  </TabsList>

  <TabsContent value="review">
    <ReviewTab />
  </TabsContent>

  <TabsContent value="similarity">
    <SimilarityTab />
  </TabsContent>
</Tabs>
```

---

## Implementation Order

### Step 1: Backend APIs (Days 1-2)
1. ✅ Create `getCrawlJobPages()` in crawl.ts
2. ✅ Create pages.ts with `getPageEntities()`
3. ✅ Enhance extracted.ts with filters (crawl_job_id, page_url)
4. ✅ Create `bulkApproveByPage()` in extracted.ts
5. ✅ Enhance similarity.ts with crawl_job_id filter
6. ✅ Update server.ts routes
7. ✅ Test all endpoints with curl

### Step 2: Shared Components (Day 3)
1. ✅ Create CrawlJobSelector
2. ✅ Create BulkActionsBar
3. ✅ Create PageNode
4. ✅ Create EntityEditDialog

### Step 3: ReviewTab (Days 4-5)
1. ✅ Create HierarchicalEntityView
2. ✅ Create ReviewTab wrapper
3. ✅ Wire up expansion/collapse logic
4. ✅ Wire up entity selection logic
5. ✅ Wire up bulk actions
6. ✅ Test full workflow

### Step 4: SimilarityTab (Day 6)
1. ✅ Create SimilarityTab with job filter
2. ✅ Add similarity range slider
3. ✅ Test filtering

### Step 5: Integration & Testing (Day 7)
1. ✅ Update App.tsx
2. ✅ Delete old ExtractionTab.tsx and IdentityTab.tsx
3. ✅ End-to-end testing
4. ✅ Performance testing

---

## Files to Create

### New Files
- `src/workers/coordinator/src/routes/pages.ts`
- `src/workers/coordinator/src/components/tabs/ReviewTab.tsx`
- `src/workers/coordinator/src/components/tabs/SimilarityTab.tsx`
- `src/workers/coordinator/src/components/review/HierarchicalEntityView.tsx`
- `src/workers/coordinator/src/components/review/PageNode.tsx`
- `src/workers/coordinator/src/components/review/EntityEditDialog.tsx`
- `src/workers/coordinator/src/components/review/BulkActionsBar.tsx`
- `src/workers/coordinator/src/components/common/CrawlJobSelector.tsx`

### Files to Modify
- `src/workers/coordinator/src/server.ts` (add new routes)
- `src/workers/coordinator/src/routes/crawl.ts` (add getCrawlJobPages)
- `src/workers/coordinator/src/routes/extracted.ts` (add filters, bulk-approve-by-page)
- `src/workers/coordinator/src/routes/similarity.ts` (add job filter)
- `src/workers/coordinator/src/App.tsx` (update tab names)

### Files to Delete
- `src/workers/coordinator/src/components/tabs/ExtractionTab.tsx`
- `src/workers/coordinator/src/components/tabs/IdentityTab.tsx`

---

## Success Criteria

✅ Curator can select a crawl job and see pages from that job
✅ Curator can expand pages to see extracted entities
✅ Curator can select entire pages or individual entities
✅ Curator can edit entity fields inline
✅ Curator can bulk approve pages (all entities from selected pages)
✅ Curator can trigger similarity for approved pages (auto-approves + queues)
✅ Similarity tab shows pairs with optional job filter (cross-job by default)
✅ All entities maintain traceability: entity → page → discovered_url → crawl_job
✅ Performance: Loading 100+ pages < 2s
✅ UX: Clear loading states, empty states, error handling
