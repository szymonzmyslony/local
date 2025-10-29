import { useEffect, useMemo, useState } from "react";
import { box, row, table } from "../uiStyles";
import type { Page, PageWithContent } from "../../../../types/common";

type Props = {
    galleryId: string;
    get: <T = unknown>(path: string) => Promise<T>;
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
};

export function PagesSection({ galleryId, get, post }: Props) {
    const [pages, setPages] = useState<Page[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [previewPage, setPreviewPage] = useState<PageWithContent | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
    const toggle = (id: string) => setSelectedIds(prev => { const c = new Set(prev); c.has(id) ? c.delete(id) : c.add(id); return c; });

    const loadPages = async () => {
        setLoading(true);
        try {
            const rows = await get<Page[]>(`/api/pages?galleryId=${encodeURIComponent(galleryId)}`);
            setPages(rows);
            setSelectedIds(new Set());
            setPreviewPage(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPages();
    }, [galleryId]);

    const byStatus = useMemo(() => {
        const groups = {
            never: pages.filter(p => p.fetch_status === "never"),
            ok: pages.filter(p => p.fetch_status === "ok"),
            error: pages.filter(p => p.fetch_status === "error"),
            other: pages.filter(p => !["never", "ok", "error"].includes(p.fetch_status)),
        };
        return groups;
    }, [pages]);

    return (
        <section style={box}>
            <h2>Pages</h2>

            <div style={{ marginBottom: "1rem" }}>
                <strong>Total:</strong> {pages.length} pages |
                <strong> Pending:</strong> {byStatus.never.length} |
                <strong> Fetched:</strong> {byStatus.ok.length} |
                <strong> Errors:</strong> {byStatus.error.length}
            </div>

            <div style={row}>
                <button type="button" onClick={() => {
                    const input = prompt("Enter event list URLs (comma-separated):");
                    if (!input) return;
                    const listUrls = input.split(",").map(s => s.trim()).filter(Boolean);
                    post<{ id: string }>("/api/links/discover", { galleryId, listUrls, limit: 100 }).then(({ id }) => {
                        alert(`Discover links workflow started: ${id}`);
                    });
                }}>Discover More Links</button>

                <button type="button" onClick={loadPages} disabled={loading}>
                    {loading ? "Loading..." : "Refresh"}
                </button>
            </div>

            {pages.length > 0 && (
                <>
                    <div style={{ margin: "8px 0" }}>Selected: {selectedCount}</div>
                    <table style={table}>
                        <thead><tr><th></th><th>Kind</th><th>URL</th><th>Status</th></tr></thead>
                        <tbody>
                            {pages.map(p => (
                                <tr key={p.id}>
                                    <td><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} /></td>
                                    <td>{p.kind}</td>
                                    <td>
                                        <button type="button" onClick={async () => {
                                            setPreviewLoading(true);
                                            try {
                                                const data = await get<PageWithContent>(`/api/page-content?pageId=${encodeURIComponent(p.id)}`);
                                                setPreviewPage(data);
                                            } catch (err) {
                                                alert(`Failed to load page content: ${err}`);
                                            } finally {
                                                setPreviewLoading(false);
                                            }
                                        }}>View</button>
                                        {' '}
                                        <a href={p.url ?? p.normalized_url} target="_blank" rel="noreferrer">{p.normalized_url}</a>
                                    </td>
                                    <td>{p.fetch_status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={row}>
                        <button type="button" disabled={!selectedCount} onClick={async () => {
                            const { id } = await post<{ id: string }>("/api/pages/scrape", { pageIds: [...selectedIds] });
                            alert(`Scrape workflow started: ${id}`);
                        }}>Scrape Selected</button>

                        <button type="button" disabled={!selectedCount} onClick={async () => {
                            const { id } = await post<{ id: string }>("/api/pages/extract", { pageIds: [...selectedIds] });
                            alert(`Extract workflow started: ${id}`);
                        }}>Extract Selected</button>

                        <button type="button" disabled={!selectedCount} onClick={async () => {
                            const { id } = await post<{ id: string }>("/api/pages/process-events", { pageIds: [...selectedIds] });
                            alert(`Process events workflow started: ${id}`);
                        }}>Process Events</button>
                    </div>
                </>
            )}

            {previewLoading && <div style={{ marginTop: "1rem" }}>Loading content…</div>}
            {previewPage && !previewLoading && (
                <div style={{ marginTop: "1rem" }}>
                    <h3>Page Content Preview</h3>
                    <div style={{ marginBottom: "0.5rem" }}>
                        <strong>Kind:</strong> {previewPage.kind}
                        {' '}
                        <strong>Status:</strong> {previewPage.fetch_status}
                        {' '}
                        <strong>Fetched:</strong> {previewPage.fetched_at ?? "n/a"}
                    </div>
                    <pre style={{ maxHeight: 300, overflow: "auto", background: "#f5f5f5", padding: "1rem", borderRadius: 4 }}>
                        {previewPage.page_content?.markdown ?? "(no markdown saved)"}
                    </pre>
                </div>
            )}
        </section>
    );
}

