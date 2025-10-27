import { useState, useEffect } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Moon, Sun } from "@phosphor-icons/react";

export default function App() {
	const [theme, setTheme] = useState<"dark" | "light">(() => {
		const savedTheme = localStorage.getItem("theme");
		return (savedTheme as "dark" | "light") || "dark";
	});

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

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
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
					<Button onClick={toggleTheme} variant="ghost" size="md">
						{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
						<span className="ml-2">{theme === "dark" ? "Light" : "Dark"}</span>
					</Button>
				</div>

				{/* Stats Cards */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
					<Card className="p-6">
						<h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
							Crawler
						</h3>
						<p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-2">
							--
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
							--
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
							--
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
							--
						</p>
						<p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
							Total entities
						</p>
					</Card>
				</div>

				{/* Quick Actions */}
				<Card className="p-6">
					<h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
						Quick Actions
					</h2>
					<div className="flex flex-wrap gap-3">
						<Button variant="default">Start Crawl</Button>
						<Button variant="secondary">Review Entities</Button>
						<Button variant="secondary">Browse Pages</Button>
						<Button variant="secondary">View Golden Records</Button>
					</div>
				</Card>

				{/* Coming Soon Notice */}
				<div className="mt-8 text-center">
					<p className="text-neutral-600 dark:text-neutral-400">
						Dashboard features coming soon! Check{" "}
						<code className="bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded text-sm">
							PRD.md
						</code>{" "}
						for detailed specifications.
					</p>
				</div>
			</div>
		</div>
	);
}
