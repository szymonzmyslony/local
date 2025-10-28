import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CrawlJobSelector } from "../common/CrawlJobSelector";
import type { EntityType } from "../../types/curator";

interface SimilarityPair {
  link_id: string;
  source_a_id: string;
  source_b_id: string;
  source_a_name?: string;
  source_b_name?: string;
  source_a_title?: string;
  source_b_title?: string;
  source_a_bio?: string;
  source_b_bio?: string;
  source_a_description?: string;
  source_b_description?: string;
  similarity_score: number;
}

interface SimilarityPairsResponse {
  pairs: SimilarityPair[];
  total: number;
}

export function SimilarityTab() {
  const [crawlJobFilter, setCrawlJobFilter] = useState<string>("");
  const [entityType, setEntityType] = useState<EntityType>("artist");
  const [similarityRange, setSimilarityRange] = useState<[number, number]>([0.85, 0.95]);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SimilarityPairsResponse>({
    queryKey: ["similarity-pairs", entityType, similarityRange[0], similarityRange[1], crawlJobFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        min_similarity: similarityRange[0].toString(),
        max_similarity: similarityRange[1].toString(),
      });

      if (crawlJobFilter) {
        params.set("crawl_job_id", crawlJobFilter);
      }

      const res = await fetch(`/api/similarity/pairs/${entityType}s?${params}`);
      if (!res.ok) throw new Error("Failed to fetch similarity pairs");
      return res.json();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/similarity/pairs/${linkId}/${entityType}/dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Failed to dismiss pair");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["similarity-pairs"] });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/similarity/pairs/${linkId}/${entityType}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Failed to mark for merge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["similarity-pairs"] });
    },
  });

  const pairs = data?.pairs || [];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h2 className="text-2xl font-bold mb-4">Similarity Review</h2>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <CrawlJobSelector value={crawlJobFilter} onChange={setCrawlJobFilter} />

          <div className="flex items-center gap-2 min-w-[300px]">
            <label className="text-sm font-medium whitespace-nowrap">Similarity:</label>
            <Slider
              value={similarityRange}
              onValueChange={(values) => setSimilarityRange(values as [number, number])}
              min={0.5}
              max={1.0}
              step={0.01}
              className="flex-1"
            />
            <span className="text-sm text-gray-600 min-w-[100px]">
              {(similarityRange[0] * 100).toFixed(0)}% - {(similarityRange[1] * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Entity type tabs */}
        <Tabs value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
          <TabsList>
            <TabsTrigger value="artist">Artists</TabsTrigger>
            <TabsTrigger value="gallery">Galleries</TabsTrigger>
            <TabsTrigger value="event">Events</TabsTrigger>
          </TabsList>

          <TabsContent value={entityType} className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="text-gray-500">Loading similarity pairs...</div>
              </div>
            ) : pairs.length === 0 ? (
              <div className="flex items-center justify-center p-12 border rounded-lg bg-gray-50">
                <div className="text-center text-gray-500">
                  <p className="text-lg">No similar pairs found</p>
                  <p className="text-sm mt-2">
                    {crawlJobFilter ? "Try selecting a different crawl job or" : "Try"} adjusting the
                    similarity range
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  {pairs.length} similar {pairs.length === 1 ? "pair" : "pairs"} found
                  {crawlJobFilter && " (filtered by crawl job)"}
                </div>

                {pairs.map((pair) => {
                  const nameA = pair.source_a_name || pair.source_a_title || "Unnamed";
                  const nameB = pair.source_b_name || pair.source_b_title || "Unnamed";
                  const bioA = pair.source_a_bio || pair.source_a_description || "";
                  const bioB = pair.source_b_bio || pair.source_b_description || "";

                  return (
                    <Card key={pair.link_id} className="p-4">
                      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                        {/* Entity A */}
                        <div>
                          <div className="font-semibold">{nameA}</div>
                          <div className="text-sm text-gray-600 line-clamp-2">{bioA}</div>
                        </div>

                        {/* Similarity Score */}
                        <div className="text-center px-4">
                          <div className="text-3xl font-bold text-blue-600">
                            {(pair.similarity_score * 100).toFixed(0)}%
                          </div>
                          <div className="text-xs text-gray-500">similarity</div>
                        </div>

                        {/* Entity B */}
                        <div className="text-right">
                          <div className="font-semibold">{nameB}</div>
                          <div className="text-sm text-gray-600 line-clamp-2">{bioB}</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-4 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => dismissMutation.mutate(pair.link_id)}
                          disabled={dismissMutation.isPending}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => mergeMutation.mutate(pair.link_id)}
                          disabled={mergeMutation.isPending}
                        >
                          Mark for Merge
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
