import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/card/Card";
import { Button } from "@/components/button/Button";

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

interface IdentityEntity {
	id: string;
	entity_type: string;
	display_name: string;
	last_materialized_at: string | null;
	created_at: string;
}

export function IdentityTab() {
	const [view, setView] = useState<"curator" | "browse">("curator");
	const [entityTab, setEntityTab] = useState<"artist" | "gallery" | "event">("artist");
	const [page, setPage] = useState(0);
	const limit = 50;

	// Fetch similarity pairs for curator review
	const { data: curatorData, isLoading: curatorLoading, refetch: refetchCurator } = useQuery({
		queryKey: ["similarity-pairs", entityTab],
		queryFn: async () => {
			const response = await fetch(`/api/similarity/pairs/${entityTab}s`);
			if (!response.ok) throw new Error("Failed to fetch similarity pairs");
			return response.json() as Promise<{ pairs: CuratorQueueItem[]; total: number }>;
		},
		enabled: view === "curator",
	});

	// Fetch extracted entities (for browsing)
	const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
		queryKey: ["extracted-entities-browse", entityTab, page],
		queryFn: async () => {
			const response = await fetch(
				`/api/extracted/${entityTab}s?limit=${limit}&offset=${page * limit}&status=approved`
			);
			if (!response.ok) throw new Error("Failed to fetch entities");
			return response.json() as Promise<{ entities: IdentityEntity[]; total: number }>;
		},
		enabled: view === "browse",
	});

	const handleMerge = async (item: CuratorQueueItem) => {
		try {
			const response = await fetch(`/api/similarity/pairs/${item.link_id}/${entityTab}/merge`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					notes: "Merged via curator UI",
				}),
			});

			if (!response.ok) throw new Error("Failed to mark pair for merge");

			refetchCurator();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to merge entities");
		}
	};

	const handleDismiss = async (linkId: string) => {
		try {
			const response = await fetch(`/api/similarity/pairs/${linkId}/${entityTab}/dismiss`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					notes: "Dismissed via curator UI",
				}),
			});

			if (!response.ok) throw new Error("Failed to dismiss pair");

			refetchCurator();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to dismiss pair");
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex justify-between items-center">
				<h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
					Identity Management
				</h2>

				{/* View Toggle */}
				<div className="flex gap-2">
					<button
						onClick={() => setView("curator")}
						className={`px-4 py-2 rounded-lg font-medium transition-colors ${
							view === "curator"
								? "bg-blue-600 text-white"
								: "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
						}`}
					>
						Curator Queue
					</button>
					<button
						onClick={() => setView("browse")}
						className={`px-4 py-2 rounded-lg font-medium transition-colors ${
							view === "browse"
								? "bg-blue-600 text-white"
								: "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
						}`}
					>
						Browse Entities
					</button>
				</div>
			</div>

			{view === "curator" ? (
				<Card className="p-6">
					<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
						Entity Pairs for Review
					</h3>
					{curatorLoading ? (
						<div className="text-neutral-600 dark:text-neutral-400">Loading...</div>
					) : !curatorData?.pairs.length ? (
						<div className="text-neutral-600 dark:text-neutral-400">No similarity pairs pending review</div>
					) : (
						<div className="space-y-4">
							{curatorData.pairs.map((item) => (
								<Card key={item.link_id} className="p-4 bg-neutral-50 dark:bg-neutral-900">
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
										<div className="p-3 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
											<p className="font-medium text-neutral-900 dark:text-neutral-100">
												{item.entity_a_name}
											</p>
											<p className="text-xs text-neutral-500 dark:text-neutral-500">
												ID: {item.entity_a_id.slice(0, 8)}...
											</p>
										</div>
										<div className="p-3 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
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
											onClick={() => handleMerge(item)}
										>
											Mark for Merge
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleDismiss(item.link_id)}
										>
											Dismiss
										</Button>
									</div>
								</Card>
							))}
						</div>
					)}
				</Card>
			) : (
				<Card className="p-6">
					<h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
						Identity Entities
					</h3>

					{/* Sub-tabs */}
					<div className="flex gap-2 mb-4 border-b border-neutral-200 dark:border-neutral-700">
						<button
							onClick={() => { setEntityTab("artist"); setPage(0); }}
							className={`px-4 py-2 font-medium transition-colors ${
								entityTab === "artist"
									? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
									: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
							}`}
						>
							Artists
						</button>
						<button
							onClick={() => { setEntityTab("gallery"); setPage(0); }}
							className={`px-4 py-2 font-medium transition-colors ${
								entityTab === "gallery"
									? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
									: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
							}`}
						>
							Galleries
						</button>
						<button
							onClick={() => { setEntityTab("event"); setPage(0); }}
							className={`px-4 py-2 font-medium transition-colors ${
								entityTab === "event"
									? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
									: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
							}`}
						>
							Events
						</button>
					</div>

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
											<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Last Materialized</th>
											<th className="text-left py-2 px-4 font-medium text-neutral-900 dark:text-neutral-100">Created</th>
										</tr>
									</thead>
									<tbody>
										{entitiesData.entities.map((entity) => (
											<tr key={entity.id} className="border-b border-neutral-200 dark:border-neutral-700">
												<td className="py-2 px-4 text-neutral-900 dark:text-neutral-100 font-medium">
													{entity.display_name}
												</td>
												<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
													{entity.last_materialized_at
														? new Date(entity.last_materialized_at).toLocaleDateString()
														: "Never"}
												</td>
												<td className="py-2 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
													{new Date(entity.created_at).toLocaleDateString()}
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
			)}
		</div>
	);
}
