import { useState, useEffect } from "react";
import { Card } from "@/components/card/Card";

interface StatsOverview {
  crawler: { activeJobs: number };
  source: { pendingExtractions: number };
  extracted: { pendingReviews: number };
  golden: {
    totalEntities: number;
    artists: number;
    galleries: number;
    events: number;
  };
}

export function OverviewTab() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/stats/overview");
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      const data = (await response.json()) as StatsOverview;
      setStats(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch stats";
      setError(message);
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">
        Pipeline Overview
      </h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Crawler
          </h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {loading ? "..." : (stats?.crawler.activeJobs ?? 0)}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
            Active jobs
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Source
          </h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {loading ? "..." : (stats?.source.pendingExtractions ?? 0)}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
            Pending extractions
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Extracted
          </h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {loading ? "..." : (stats?.extracted.pendingReviews ?? 0)}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
            Pending reviews
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Golden
          </h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
            {loading ? "..." : (stats?.golden.totalEntities ?? 0)}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
            {stats &&
              `${stats.golden.artists}A / ${stats.golden.galleries}G / ${stats.golden.events}E`}
          </p>
        </Card>
      </div>
    </div>
  );
}
