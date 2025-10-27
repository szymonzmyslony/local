import { useState, useEffect, useCallback, useId } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Modal } from "@/components/modal/Modal";
import { Input } from "@/components/input/Input";
import { Moon, Sun, ArrowClockwise } from "@phosphor-icons/react";

interface StatsOverview {
	crawler: { activeJobs: number };
	source: { pendingExtractions: number };
	identity: { pendingReviews: number };
	golden: {
		totalEntities: number;
		artists: number;
		galleries: number;
		events: number;
	};
}

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

interface CuratorQueueItem {
	link_id: string;
	entity_a_id: string;
	entity_b_id: string;
	entity_type: string;
	similarity_score: number;
	entity_a_name: string;
	entity_b_name: string;
	created_at: string;
}

export default function App() {
	const [theme, setTheme] = useState<"dark" | "light">(() => {
		const savedTheme = localStorage.getItem("theme");
		return (savedTheme as "dark" | "light") || "dark";
	});

	const [stats, setStats] = useState<StatsOverview | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Modal states
	const [showCrawlModal, setShowCrawlModal] = useState(false);
	const [showReviewModal, setShowReviewModal] = useState(false);
	const [showJobsModal, setShowJobsModal] = useState(false);
	const [showGoldenModal, setShowGoldenModal] = useState(false);

	// Data states
	const [crawlJobs, setCrawlJobs] = useState<CrawlJob[]>([]);
	const [curatorQueue, setCuratorQueue] = useState<CuratorQueueItem[]>([]);

	// Form states
	const [crawlSeed, setCrawlSeed] = useState("");
	const [crawlMaxPages, setCrawlMaxPages] = useState("50");
	const [crawlSearchTerm, setCrawlSearchTerm] = useState("");
	const [includeSubdomains, setIncludeSubdomains] = useState(false);
	const [forceRescrape, setForceRescrape] = useState(false);
	const crawlSeedId = useId();
	const crawlMaxPagesId = useId();
	const crawlSearchTermId = useId();

	useEffect(() => {
		// Apply theme
		if (theme === "dark") {
			document.documentElement.classList.add("dark");
			document.documentElement.classList.remove("light");
		} else {
			document.documentElement.classList.remove("dark");
			document.documentElement.classList.add("light");
		}
		localStorage.setItem("theme", theme);
	}, [theme]);

	const fetchStats = useCallback(async () => {
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
			const message = err instanceof Error ? err.message : "Failed to fetch stats";
			setError(message);
			console.error("Error fetching stats:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		// Fetch initial stats
		fetchStats();
	}, [fetchStats]);

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
	};

	const fetchCrawlJobs = async () => {
		try {
			const response = await fetch("/api/crawl/jobs");
			if (!response.ok) throw new Error("Failed to fetch crawl jobs");
			const data = (await response.json()) as { jobs: CrawlJob[] };
			setCrawlJobs(data.jobs ?? []);
		} catch (err) {
			console.error("Error fetching crawl jobs:", err);
		}
	};

	const fetchCuratorQueue = async () => {
		try {
			const response = await fetch("/api/curator/queue?limit=20");
			if (!response.ok) throw new Error("Failed to fetch curator queue");
			const data = (await response.json()) as { queue: CuratorQueueItem[] };
			setCuratorQueue(data.queue ?? []);
		} catch (err) {
			console.error("Error fetching curator queue:", err);
		}
	};

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
					maxPages: Number.isFinite(parsedMaxPages) ? parsedMaxPages : undefined,
					searchTerm: crawlSearchTerm || undefined,
					includeSubdomains,
					force: forceRescrape,
				}),
			});

			if (!response.ok) {
				const errorBody = (await response.json()) as { error?: string };
				throw new Error(errorBody.error || "Failed to start crawl");
			}

			const result = (await response.json()) as {
				jobId: string;
			};
			alert(`Crawl started successfully! Job ID: ${result.jobId}`);

			// Reset form and close modal
			setCrawlSeed("");
			setCrawlMaxPages("50");
			setCrawlSearchTerm("");
			setIncludeSubdomains(false);
			setForceRescrape(false);
			setShowCrawlModal(false);

			// Refresh stats
			fetchStats();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to start crawl");
			console.error("Error starting crawl:", err);
		}
	};

	const handleMergeEntities = async (item: CuratorQueueItem, winnerId: string) => {
		const loserId = winnerId === item.entity_a_id ? item.entity_b_id : item.entity_a_id;

		try {
			const response = await fetch("/api/curator/merge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					linkId: item.link_id,
					winnerId,
					loserId,
					entityType: item.entity_type,
				}),
			});

			if (!response.ok) throw new Error("Failed to merge entities");

			// Remove from queue
			setCuratorQueue(prev => prev.filter(i => i.link_id !== item.link_id));
			fetchStats(); // Refresh stats
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to merge entities");
		}
	};

	const handleDismissLink = async (linkId: string) => {
		try {
			const response = await fetch("/api/curator/dismiss", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ linkId }),
			});

			if (!response.ok) throw new Error("Failed to dismiss link");

			// Remove from queue
			setCuratorQueue(prev => prev.filter(i => i.link_id !== linkId));
			fetchStats(); // Refresh stats
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to dismiss link");
		}
	};

	const openReviewModal = () => {
		fetchCuratorQueue();
		setShowReviewModal(true);
	};

	const openJobsModal = () => {
		fetchCrawlJobs();
		setShowJobsModal(true);
	};

	return (
		<div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
			<div className="max-w-7xl mx-auto">
				{/* Header */}
				<div className="flex items-center justify-between mb-8">
					<div>
						<h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
							CityChat Coordinator
						</h1>
						<p className="text-neutral-600 dark:text-neutral-400 mt-1">
							Admin dashboard for content processing pipeline
						</p>
					</div>
					<div className="flex gap-2">
						<Button onClick={fetchStats} variant="ghost" size="md">
							<ArrowClockwise size={20} />
						</Button>
						<Button onClick={toggleTheme} variant="ghost" size="md">
							{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
							<span className="ml-2">{theme === "dark" ? "Light" : "Dark"}</span>
						</Button>
					</div>
				</div>

				{/* Error Message */}
				{error && (
					<div className="mb-6 p-4 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
						{error}
					</div>
				)}

				{/* Stats Cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
					<Card className="p-6">
						<h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
							Crawler
						</h3>
						<p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
							{loading ? "..." : stats?.crawler.activeJobs ?? 0}
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
							{loading ? "..." : stats?.source.pendingExtractions ?? 0}
						</p>
						<p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
							Pending extractions
						</p>
					</Card>

					<Card className="p-6">
						<h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
							Identity
						</h3>
						<p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
							{loading ? "..." : stats?.identity.pendingReviews ?? 0}
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
							{loading ? "..." : stats?.golden.totalEntities ?? 0}
						</p>
						<p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
							{stats && `${stats.golden.artists}A / ${stats.golden.galleries}G / ${stats.golden.events}E`}
						</p>
					</Card>
				</div>

				{/* Quick Actions */}
				<Card className="p-6 mb-8">
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
						Quick Actions
					</h2>
					<div className="flex flex-wrap gap-3">
						<Button variant="primary" onClick={() => setShowCrawlModal(true)}>
							Start Crawl
						</Button>
						<Button variant="secondary" onClick={openReviewModal}>
							Review Entities
						</Button>
						<Button variant="secondary" onClick={openJobsModal}>
							View Crawl Jobs
						</Button>
						<Button variant="secondary" onClick={() => setShowGoldenModal(true)}>
							Browse Golden Records
						</Button>
					</div>
				</Card>

				{/* Start Crawl Modal */}
				<Modal isOpen={showCrawlModal} onClose={() => setShowCrawlModal(false)}>
						<div className="p-6">
							<h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
								Start New Crawl
							</h2>
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
											Search Term (optional)
										</label>
										<Input
											type="text"
											placeholder="Filter URLs by search term"
											id={crawlSearchTermId}
											value={crawlSearchTerm}
											onChange={(e) => setCrawlSearchTerm(e.target.value)}
										/>
									</div>
								<div className="space-y-3 pt-2">
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
										<span>Force rescrape existing pages</span>
									</label>
								</div>
								<div className="flex gap-3 mt-6">
									<Button variant="primary" onClick={handleStartCrawl}>
										Start Crawl
									</Button>
									<Button variant="ghost" onClick={() => setShowCrawlModal(false)}>
										Cancel
									</Button>
								</div>
							</div>
						</div>
					</Modal>

				{/* Review Entities Modal */}
				<Modal isOpen={showReviewModal} onClose={() => setShowReviewModal(false)}>
						<div className="p-6 max-h-[80vh] overflow-y-auto">
							<h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
								Review Entity Matches
							</h2>
							{curatorQueue.length === 0 ? (
								<p className="text-neutral-600 dark:text-neutral-400">
									No entities pending review
								</p>
							) : (
								<div className="space-y-4">
									{curatorQueue.map((item) => (
										<Card key={item.link_id} className="p-4">
											<div className="flex justify-between items-start mb-3">
												<div>
													<span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
														{item.entity_type.toUpperCase()}
													</span>
													<p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
														Similarity: {(item.similarity_score * 100).toFixed(1)}%
													</p>
												</div>
											</div>
											<div className="space-y-2 mb-4">
												<div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded">
													<p className="font-medium text-neutral-900 dark:text-neutral-100">
														{item.entity_a_name}
													</p>
													<p className="text-xs text-neutral-500 dark:text-neutral-500">
														ID: {item.entity_a_id.slice(0, 8)}...
													</p>
												</div>
												<div className="p-3 bg-neutral-100 dark:bg-neutral-800 rounded">
													<p className="font-medium text-neutral-900 dark:text-neutral-100">
														{item.entity_b_name}
													</p>
													<p className="text-xs text-neutral-500 dark:text-neutral-500">
														ID: {item.entity_b_id.slice(0, 8)}...
													</p>
												</div>
											</div>
											<div className="flex gap-2">
												<Button
												variant="primary"
													size="sm"
													onClick={() => handleMergeEntities(item, item.entity_a_id)}
												>
													Keep First
												</Button>
												<Button
												variant="secondary"
													size="sm"
													onClick={() => handleMergeEntities(item, item.entity_b_id)}
												>
													Keep Second
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => handleDismissLink(item.link_id)}
												>
													Dismiss
												</Button>
											</div>
										</Card>
									))}
								</div>
							)}
						</div>
					</Modal>

				{/* Crawl Jobs Modal */}
				<Modal isOpen={showJobsModal} onClose={() => setShowJobsModal(false)}>
						<div className="p-6 max-h-[80vh] overflow-y-auto">
							<h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
								Crawl Jobs
							</h2>
							{crawlJobs.length === 0 ? (
								<p className="text-neutral-600 dark:text-neutral-400">
									No crawl jobs found
								</p>
							) : (
								<div className="space-y-3">
									{crawlJobs.map((job) => (
										<Card key={job.id} className="p-4">
											<div className="flex justify-between items-start">
												<div className="flex-1">
													<p className="font-medium text-neutral-900 dark:text-neutral-100">
														{job.seed_url}
													</p>
													<p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
														Status: <span className="font-medium">{job.status}</span>
													</p>
													<p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
														{job.urls_fetched}/{job.urls_discovered} URLs fetched • Max: {job.max_pages}
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
									))}
								</div>
							)}
						</div>
					</Modal>

				{/* Golden Records Modal */}
				<Modal isOpen={showGoldenModal} onClose={() => setShowGoldenModal(false)}>
						<div className="p-6">
							<h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-4">
								Golden Records
							</h2>
							<div className="space-y-3">
								<Card className="p-4">
									<p className="font-medium text-neutral-900 dark:text-neutral-100">
										Artists: {stats?.golden.artists ?? 0}
									</p>
								</Card>
								<Card className="p-4">
									<p className="font-medium text-neutral-900 dark:text-neutral-100">
										Galleries: {stats?.golden.galleries ?? 0}
									</p>
								</Card>
								<Card className="p-4">
									<p className="font-medium text-neutral-900 dark:text-neutral-100">
										Events: {stats?.golden.events ?? 0}
									</p>
								</Card>
								<p className="text-sm text-neutral-600 dark:text-neutral-400 mt-4">
									Detailed golden record browsing coming soon!
								</p>
							</div>
						</div>
					</Modal>
			</div>
		</div>
	);
}
