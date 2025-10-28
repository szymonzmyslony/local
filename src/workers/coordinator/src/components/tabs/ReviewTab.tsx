import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrawlJobSelector } from "../common/CrawlJobSelector";
import { HierarchicalEntityView } from "../review/HierarchicalEntityView";
import type { EntityType } from "../../types/curator";

export function ReviewTab() {
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [entityType, setEntityType] = useState<EntityType>("artist");

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Review Extracted Entities</h2>
        <CrawlJobSelector value={selectedJob} onChange={setSelectedJob} />
      </div>

      {selectedJob ? (
        <Tabs value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
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
        <div className="flex items-center justify-center p-12 border rounded-lg bg-gray-50">
          <div className="text-center text-gray-500">
            <p className="text-lg">Select a crawl job to review extracted entities</p>
            <p className="text-sm mt-2">
              Use the dropdown above to choose a crawl job and start reviewing
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
