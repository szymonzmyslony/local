import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { CrawlJobsResponse } from "../../types/curator";

interface CrawlJobSelectorProps {
  value: string;
  onChange: (jobId: string) => void;
}

export function CrawlJobSelector({ value, onChange }: CrawlJobSelectorProps) {
  const { data, isLoading } = useQuery<CrawlJobsResponse>({
    queryKey: ["crawl-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/crawl/jobs");
      if (!res.ok) throw new Error("Failed to fetch crawl jobs");
      return res.json();
    }
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading}>
      <SelectTrigger className="w-[400px]">
        <SelectValue
          placeholder={isLoading ? "Loading jobs..." : "Select crawl job..."}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All Crawl Jobs</SelectItem>
        {data?.jobs?.map((job) => (
          <SelectItem key={job.id} value={job.id}>
            <span className="font-mono text-sm">{job.seed_url}</span>
            <span className="text-gray-500 ml-2">
              ({job.status}) - {new Date(job.created_at).toLocaleDateString()}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
