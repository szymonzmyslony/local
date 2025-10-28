import { useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/card/Card";
import { Button } from "@/components/button/Button";
import { Input } from "@/components/input/Input";

interface CrawlJob {
  id: string;
  seed_url: string;
  max_pages: number;
  search_term?: string;
  status: string;
  created_at: string;
  urls_discovered: number;
  urls_fetched: number;
  include_subdomains?: boolean | null;
  force?: boolean | null;
}

interface DiscoveredUrl {
  url: string;
  status: string;
  fetch_attempts: number;
}

export function CrawlTab() {
  // Form state
  const [crawlSeed, setCrawlSeed] = useState("");
  const [crawlMaxPages, setCrawlMaxPages] = useState("50");
  const [crawlSearchTerm, setCrawlSearchTerm] = useState("");
  const [includeSubdomains, setIncludeSubdomains] = useState(false);
  const [forceRescrape, setForceRescrape] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const crawlSeedId = useId();
  const crawlMaxPagesId = useId();
  const crawlSearchTermId = useId();

  // Fetch crawl jobs
  const {
    data: jobsData,
    isLoading: jobsLoading,
    refetch: refetchJobs
  } = useQuery({
    queryKey: ["crawl-jobs"],
    queryFn: async () => {
      const response = await fetch("/api/crawl/jobs");
      if (!response.ok) throw new Error("Failed to fetch jobs");
      return response.json() as Promise<{ jobs: CrawlJob[] }>;
    }
  });

  // Fetch discovered URLs for expanded job
  const { data: urlsData, isLoading: urlsLoading } = useQuery({
    queryKey: ["crawl-urls", expandedJob],
    queryFn: async () => {
      if (!expandedJob) return null;
      const response = await fetch(`/api/crawl/jobs/${expandedJob}/urls`);
      if (!response.ok) throw new Error("Failed to fetch URLs");
      return response.json() as Promise<{
        urls: DiscoveredUrl[];
        total: number;
      }>;
    },
    enabled: !!expandedJob
  });

  const handleStartCrawl = async () => {
    if (!crawlSeed.trim()) {
      alert("Please enter a seed URL");
      return;
    }

    try {
      const parsedMaxPages = parseInt(crawlMaxPages, 10);
      const response = await fetch("/api/crawl/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: crawlSeed,
          maxPages: Number.isFinite(parsedMaxPages)
            ? parsedMaxPages
            : undefined,
          searchTerm: crawlSearchTerm || undefined,
          includeSubdomains,
          force: forceRescrape
        })
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { error?: string };
        throw new Error(errorBody.error || "Failed to start crawl");
      }

      const result = (await response.json()) as { jobId: string };
      alert(`Crawl started successfully! Job ID: ${result.jobId}`);

      // Reset form
      setCrawlSeed("");
      setCrawlMaxPages("50");
      setCrawlSearchTerm("");
      setIncludeSubdomains(false);
      setForceRescrape(false);

      // Refresh jobs list
      refetchJobs();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start crawl");
      console.error("Error starting crawl:", err);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        Crawl Management
      </h2>

      {/* Start New Crawl */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Start New Crawl
        </h3>
        <div className="space-y-4">
          <div>
            <label
              htmlFor={crawlSeedId}
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
            >
              Seed URL *
            </label>
            <Input
              type="text"
              placeholder="https://example.com"
              id={crawlSeedId}
              value={crawlSeed}
              onChange={(e) => setCrawlSeed(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={crawlMaxPagesId}
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
              >
                Max Pages
              </label>
              <Input
                type="number"
                placeholder="50"
                id={crawlMaxPagesId}
                value={crawlMaxPages}
                onChange={(e) => setCrawlMaxPages(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor={crawlSearchTermId}
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
              >
                Search Term
              </label>
              <Input
                type="text"
                placeholder="Optional filter"
                id={crawlSearchTermId}
                value={crawlSearchTerm}
                onChange={(e) => setCrawlSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={includeSubdomains}
                onChange={(e) => setIncludeSubdomains(e.target.checked)}
              />
              <span>Include subdomains</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={forceRescrape}
                onChange={(e) => setForceRescrape(e.target.checked)}
              />
              <span>Force rescrape</span>
            </label>
          </div>
          <Button variant="primary" onClick={handleStartCrawl}>
            Start Crawl
          </Button>
        </div>
      </Card>

      {/* Jobs Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
          Crawl Jobs
        </h3>
        {jobsLoading ? (
          <div className="text-neutral-600 dark:text-neutral-400">
            Loading...
          </div>
        ) : !jobsData?.jobs.length ? (
          <div className="text-neutral-600 dark:text-neutral-400">
            No crawl jobs yet
          </div>
        ) : (
          <div className="space-y-2">
            {jobsData.jobs.map((job) => (
              <div key={job.id}>
                <Card
                  className="p-4 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  onClick={() =>
                    setExpandedJob(expandedJob === job.id ? null : job.id)
                  }
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        {job.seed_url}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        Status:{" "}
                        <span className="font-medium">{job.status}</span>
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                        {job.urls_fetched}/{job.urls_discovered} URLs fetched •
                        Max: {job.max_pages}
                      </p>
                      {(job.force || job.include_subdomains) && (
                        <div className="flex gap-2 mt-2">
                          {job.force && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                              Force
                            </span>
                          )}
                          {job.include_subdomains && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              Subdomains
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-neutral-500 dark:text-neutral-500">
                      {new Date(job.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Card>

                {/* Expanded: Discovered URLs */}
                {expandedJob === job.id && (
                  <Card className="mt-2 ml-4 p-4 bg-neutral-50 dark:bg-neutral-900">
                    <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                      Discovered URLs
                    </h4>
                    {urlsLoading ? (
                      <div className="text-neutral-600 dark:text-neutral-400 text-sm">
                        Loading...
                      </div>
                    ) : !urlsData?.urls.length ? (
                      <div className="text-neutral-600 dark:text-neutral-400 text-sm">
                        No URLs discovered yet
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {urlsData.urls.map((url) => (
                          <div
                            key={url.url}
                            className="flex justify-between items-center text-sm py-1 border-b border-neutral-200 dark:border-neutral-700 last:border-0"
                          >
                            <span className="text-neutral-700 dark:text-neutral-300 truncate flex-1">
                              {url.url}
                            </span>
                            <span
                              className={`ml-2 text-xs ${
                                url.status === "fetched"
                                  ? "text-green-600 dark:text-green-400"
                                  : url.status === "failed"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-yellow-600 dark:text-yellow-400"
                              }`}
                            >
                              {url.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
