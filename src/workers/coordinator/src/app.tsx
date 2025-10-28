import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@/components/button/Button";
import { Moon, Sun, ArrowClockwise } from "@phosphor-icons/react";
import { OverviewTab } from "./components/tabs/OverviewTab";
import { CrawlTab } from "./components/tabs/CrawlTab";
import { ExtractionTab } from "./components/tabs/ExtractionTab";
import { IdentityTab } from "./components/tabs/IdentityTab";
import { GoldenTab } from "./components/tabs/GoldenTab";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5, // 5 minutes
			refetchOnWindowFocus: false,
		},
	},
});

export default function App() {
	const [theme, setTheme] = useState<"dark" | "light">(() => {
		const savedTheme = localStorage.getItem("theme");
		return (savedTheme as "dark" | "light") || "dark";
	});

	useEffect(() => {
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

	const refreshPage = () => {
		window.location.reload();
	};

	return (
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
				{/* Header */}
				<div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
					<div className="max-w-7xl mx-auto px-8 py-4">
						<div className="flex items-center justify-between mb-4">
							<div>
								<h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
									CityChat Coordinator
								</h1>
								<p className="text-neutral-600 dark:text-neutral-400 mt-1">
									Admin dashboard for content processing pipeline
								</p>
							</div>
							<div className="flex gap-2">
								<Button onClick={refreshPage} variant="ghost" size="md">
									<ArrowClockwise size={20} />
								</Button>
								<Button onClick={toggleTheme} variant="ghost" size="md">
									{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
									<span className="ml-2">{theme === "dark" ? "Light" : "Dark"}</span>
								</Button>
							</div>
						</div>

						{/* Tab Navigation */}
						<nav className="flex gap-1">
							<NavLink
								to="/"
								end
								className={({ isActive }) =>
									`px-4 py-2 rounded-t-lg font-medium transition-colors ${
										isActive
											? "bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 border-b-2 border-blue-500"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
									}`
								}
							>
								Overview
							</NavLink>
							<NavLink
								to="/crawl"
								className={({ isActive }) =>
									`px-4 py-2 rounded-t-lg font-medium transition-colors ${
										isActive
											? "bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 border-b-2 border-blue-500"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
									}`
								}
							>
								Crawl
							</NavLink>
							<NavLink
								to="/extraction"
								className={({ isActive }) =>
									`px-4 py-2 rounded-t-lg font-medium transition-colors ${
										isActive
											? "bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 border-b-2 border-blue-500"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
									}`
								}
							>
								Extraction
							</NavLink>
							<NavLink
								to="/identity"
								className={({ isActive }) =>
									`px-4 py-2 rounded-t-lg font-medium transition-colors ${
										isActive
											? "bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 border-b-2 border-blue-500"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
									}`
								}
							>
								Identity
							</NavLink>
							<NavLink
								to="/golden"
								className={({ isActive }) =>
									`px-4 py-2 rounded-t-lg font-medium transition-colors ${
										isActive
											? "bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 border-b-2 border-blue-500"
											: "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
									}`
								}
							>
								Golden
							</NavLink>
						</nav>
					</div>
				</div>

				{/* Tab Content */}
				<div className="max-w-7xl mx-auto px-8 py-8">
					<Routes>
						<Route path="/" element={<OverviewTab />} />
						<Route path="/crawl" element={<CrawlTab />} />
						<Route path="/extraction" element={<ExtractionTab />} />
						<Route path="/identity" element={<IdentityTab />} />
						<Route path="/golden" element={<GoldenTab />} />
					</Routes>
				</div>
			</div>
		</BrowserRouter>
		</QueryClientProvider>
	);
}
