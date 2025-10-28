import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/card/Card";

interface Page {
	url: string;
	extraction_status: string;
	fetched_at: string;
}

interface SourceEntity {
	id: string;
	page_url: string;
	name: string;
	bio?: string;
	website?: string;
	address?: string;
	description?: string;
	title?: string;
	venue_name?: string;
	start_ts?: string;
	end_ts?: string;
}

export function ExtractionTab() {
	const [entityTab, setEntityTab] = useState<"artists" | "galleries" | "events">("artists");
	const [page, setPage] = useState(0);
	const limit = 50;

	// Fetch pages
	const { data: pagesData, isLoading: pagesLoading } = useQuery({
		queryKey: ["pages"],
		queryFn: async () => {
			const response = await fetch(`/api/source/pages?limit=${limit}`);
			if (!response.ok) throw new Error("Failed to fetch pages");
			return response.json() as Promise<{ pages: Page[]; total: number }>;
		},
	});

	// Fetch source entities
	const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
		queryKey: ["source-entities", entityTab, page],
		queryFn: async () => {
			const response = await fetch(
				`/api/source/entities/${entityTab}?limit=${limit}&offset=${page * limit}`
			);
			if (!response.ok) throw new Error("Failed to fetch entities");
			return response.json() as Promise<{ entities: SourceEntity[]; total: number }>;
		},
	});

	return (
		<div className="space-y-6">
			<h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
				Extraction Dashboard
			</h2>

			{/* Pages Table */}
			<Card className="p-6">
				<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
					Crawled Pages
				</h3>
				{pagesLoading ? (
					<div className="text-neutral-600 dark:text-neutral-400">Loading...</div>
				) : !pagesData?.pages.length ? (
					<div className="text-neutral-600 dark:text-neutral-400">No pages yet</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b border-neutral-200 dark:border-neutral-700">
								<tr>
									<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">URL</th>
									<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Status</th>
									<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Fetched At</th>
								</tr>
							</thead>
							<tbody>
								{pagesData.pages.slice(0, 10).map((page) => (
									<tr key={page.url} className="border-b border-neutral-200 dark:border-neutral-700">
										<td className="py-2 px-4 text-neutral-700 dark:text-neutral-300 truncate max-w-md">{page.url}</td>
										<td className="py-2 px-4">
											<span className={`text-xs ${
												page.extraction_status === 'complete' ? 'text-green-600 dark:text-green-400' :
												page.extraction_status === 'failed' ? 'text-red-600 dark:text-red-400' :
												'text-yellow-600 dark:text-yellow-400'
											}`}>
												{page.extraction_status}
											</span>
										</td>
										<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
											{new Date(page.fetched_at).toLocaleDateString()}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>

			{/* Source Entities Browser */}
			<Card className="p-6">
				<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
					Source Entities
				</h3>

				{/* Sub-tabs */}
				<div className="flex gap-2 mb-4 border-b border-neutral-200 dark:border-neutral-700">
					<button
						onClick={() => { setEntityTab("artists"); setPage(0); }}
						className={`px-4 py-2 font-medium transition-colors ${
							entityTab === "artists"
								? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
								: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
						}`}
					>
						Artists
					</button>
					<button
						onClick={() => { setEntityTab("galleries"); setPage(0); }}
						className={`px-4 py-2 font-medium transition-colors ${
							entityTab === "galleries"
								? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
								: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
						}`}
					>
						Galleries
					</button>
					<button
						onClick={() => { setEntityTab("events"); setPage(0); }}
						className={`px-4 py-2 font-medium transition-colors ${
							entityTab === "events"
								? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
								: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
						}`}
					>
						Events
					</button>
				</div>

				{/* Entities Table */}
				{entitiesLoading ? (
					<div className="text-neutral-600 dark:text-neutral-400">Loading...</div>
				) : !entitiesData?.entities.length ? (
					<div className="text-neutral-600 dark:text-neutral-400">No entities yet</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="border-b border-neutral-200 dark:border-neutral-700">
									<tr>
										<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Name</th>
										{entityTab === "artists" && <th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Bio</th>}
										{entityTab === "artists" && <th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Website</th>}
										{entityTab === "galleries" && <th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Address</th>}
										{entityTab === "galleries" && <th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Website</th>}
										{entityTab === "events" && <th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Venue</th>}
										{entityTab === "events" && <th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Dates</th>}
										<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Source</th>
									</tr>
								</thead>
								<tbody>
									{entitiesData.entities.map((entity) => (
										<tr key={entity.id} className="border-b border-neutral-200 dark:border-neutral-700">
											<td className="py-2 px-4 text-neutral-900 dark:text-neutral-100 font-medium">
												{entity.name || entity.title}
											</td>
											{entityTab === "artists" && (
												<>
													<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
														{entity.bio?.slice(0, 100)}
													</td>
													<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
														{entity.website}
													</td>
												</>
											)}
											{entityTab === "galleries" && (
												<>
													<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
														{entity.address}
													</td>
													<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
														{entity.website}
													</td>
												</>
											)}
											{entityTab === "events" && (
												<>
													<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400">
														{entity.venue_name}
													</td>
													<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
														{entity.start_ts && new Date(entity.start_ts).toLocaleDateString()}
													</td>
												</>
											)}
											<td className="py-2 px-4 text-neutral-500 dark:text-neutral-500 text-xs truncate max-w-xs">
												{entity.page_url}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{/* Pagination */}
						<div className="flex justify-between items-center mt-4">
							<div className="text-sm text-neutral-600 dark:text-neutral-400">
								Showing {page * limit + 1}-{Math.min((page + 1) * limit, entitiesData.total)} of {entitiesData.total}
							</div>
							<div className="flex gap-2">
								<button
									onClick={() => setPage(p => p - 1)}
									disabled={page === 0}
									className="px-3 py-1 text-sm border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Previous
								</button>
								<button
									onClick={() => setPage(p => p + 1)}
									disabled={(page + 1) * limit >= entitiesData.total}
									className="px-3 py-1 text-sm border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Next
								</button>
							</div>
						</div>
					</>
				)}
			</Card>
		</div>
	);
}
