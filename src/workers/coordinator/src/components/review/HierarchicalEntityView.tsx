import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageNode } from "./PageNode";
import { EntityEditDialog } from "./EntityEditDialog";
import { BulkActionsBar } from "./BulkActionsBar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type {
  EntityType,
  PagesResponse,
  PageEntitiesResponse,
  ExtractedEntity,
  BulkApproveByPageRequest,
  BulkApproveByPageResponse,
} from "../../types/curator";

interface HierarchicalEntityViewProps {
  crawlJobId: string;
  entityType: EntityType;
}

export function HierarchicalEntityView({ crawlJobId, entityType }: HierarchicalEntityViewProps) {
  const queryClient = useQueryClient();

  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set());
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [entitiesByPage, setEntitiesByPage] = useState<Record<string, ExtractedEntity[]>>({});

  // Fetch pages for this crawl job
  const { data: pagesData, isLoading } = useQuery<PagesResponse>({
    queryKey: ["crawl-job-pages", crawlJobId],
    queryFn: async () => {
      const res = await fetch(`/api/crawl/jobs/${crawlJobId}/pages`);
      if (!res.ok) throw new Error("Failed to fetch pages");
      return res.json();
    },
    enabled: !!crawlJobId,
  });

  // Fetch entities when a page is expanded
  const fetchPageEntities = async (pageUrl: string): Promise<ExtractedEntity[]> => {
    const encoded = encodeURIComponent(pageUrl);
    const res = await fetch(`/api/pages/${encoded}/entities`);
    if (!res.ok) throw new Error("Failed to fetch entities");
    const data: PageEntitiesResponse = await res.json();

    return data.entities[`${entityType}s`] || [];
  };

  const togglePage = async (pageUrl: string) => {
    const newExpanded = new Set(expandedPages);

    if (expandedPages.has(pageUrl)) {
      newExpanded.delete(pageUrl);
    } else {
      newExpanded.add(pageUrl);

      // Fetch entities if not already loaded
      if (!entitiesByPage[pageUrl]) {
        const entities = await fetchPageEntities(pageUrl);
        setEntitiesByPage((prev) => ({ ...prev, [pageUrl]: entities }));
      }
    }

    setExpandedPages(newExpanded);
  };

  const handleSelectPage = (pageUrl: string, checked: boolean) => {
    const newSelected = new Set(selectedPages);

    if (checked) {
      newSelected.add(pageUrl);
    } else {
      newSelected.delete(pageUrl);

      // Also deselect all entities from this page
      const pageEntityIds = entitiesByPage[pageUrl]?.map((e) => e.id) || [];
      setSelectedEntities((prev) => {
        const next = new Set(prev);
        pageEntityIds.forEach((id) => next.delete(id));
        return next;
      });
    }

    setSelectedPages(newSelected);
  };

  const handleSelectEntity = (entityId: string, checked: boolean) => {
    const newSelected = new Set(selectedEntities);

    if (checked) {
      newSelected.add(entityId);
    } else {
      newSelected.delete(entityId);
    }

    setSelectedEntities(newSelected);
  };

  const bulkApproveMutation = useMutation<BulkApproveByPageResponse, Error, { triggerSimilarity: boolean }>({
    mutationFn: async ({ triggerSimilarity }) => {
      const pageUrls = Array.from(selectedPages);
      const payload: BulkApproveByPageRequest = {
        page_urls: pageUrls,
        entity_types: [entityType],
        trigger_similarity: triggerSimilarity,
        threshold: 0.85,
      };

      const res = await fetch("/api/extracted/bulk-approve-by-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to approve entities");
      return res.json();
    },
    onSuccess: () => {
      setSelectedPages(new Set());
      setSelectedEntities(new Set());
      queryClient.invalidateQueries({ queryKey: ["crawl-job-pages", crawlJobId] });
    },
  });

  const pages = pagesData?.pages || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading pages...</div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">No pages found for this crawl job</div>
      </div>
    );
  }

  const entityCountKey = `${entityType}s` as keyof typeof pages[0]["entity_counts"];

  return (
    <div>
      <div className="space-y-2 mb-20">
        {pages.map((page) => {
          const pageEntityCount = page.entity_counts[entityCountKey] || 0;

          if (pageEntityCount === 0) return null; // Skip pages with no entities of this type

          return (
            <PageNode
              key={page.url}
              url={page.url}
              entityCount={pageEntityCount}
              selected={selectedPages.has(page.url)}
              expanded={expandedPages.has(page.url)}
              onToggle={() => togglePage(page.url)}
              onSelectPage={(checked) => handleSelectPage(page.url, checked)}
            >
              {/* Entity list */}
              <div className="space-y-2">
                {(entitiesByPage[page.url] || []).map((entity) => (
                  <div
                    key={entity.id}
                    className="flex items-center gap-2 p-2 border rounded hover:bg-white"
                  >
                    <Checkbox
                      checked={selectedEntities.has(entity.id)}
                      onCheckedChange={(checked) => handleSelectEntity(entity.id, !!checked)}
                    />

                    <button
                      onClick={() => setEditingEntityId(entity.id)}
                      className="flex-1 text-left hover:text-blue-600"
                    >
                      <div className="font-medium">
                        {"name" in entity ? entity.name : "title" in entity ? entity.title : ""}
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {"bio" in entity
                          ? entity.bio
                          : "description" in entity
                          ? entity.description
                          : "venue_name" in entity
                          ? entity.venue_name
                          : ""}
                      </div>
                    </button>

                    <Badge
                      variant={
                        entity.review_status === "approved"
                          ? "default"
                          : entity.review_status === "rejected"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {entity.review_status}
                    </Badge>
                  </div>
                ))}
              </div>
            </PageNode>
          );
        })}
      </div>

      <BulkActionsBar
        selectedEntities={selectedEntities.size}
        selectedPages={selectedPages.size}
        onApprove={() => bulkApproveMutation.mutate({ triggerSimilarity: false })}
        onReject={() => {
          /* TODO: implement reject */
        }}
        onTriggerSimilarity={() => bulkApproveMutation.mutate({ triggerSimilarity: true })}
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
          onSave={async () => {
            // Refresh entities for all loaded pages
            const promises = Object.keys(entitiesByPage).map(async (pageUrl) => {
              const entities = await fetchPageEntities(pageUrl);
              return { pageUrl, entities };
            });

            const results = await Promise.all(promises);
            const newEntitiesByPage: Record<string, ExtractedEntity[]> = {};
            results.forEach(({ pageUrl, entities }) => {
              newEntitiesByPage[pageUrl] = entities;
            });

            setEntitiesByPage(newEntitiesByPage);
          }}
        />
      )}
    </div>
  );
}
