import { useMemo, useState } from "react";
import { box, grid2, row, table } from "../uiStyles";

type Page = { id: string; url: string; normalized_url: string; kind: string; fetch_status: string };

type Props = {
    get: <T = unknown>(path: string) => Promise<T>;
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
};

export function PagesSection({ get, post }: Props) {
    const [galleryId, setGalleryId] = useState("");
    const [pages, setPages] = useState<Page[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
    const toggle = (id: string) => setSelectedIds(prev => { const c = new Set(prev); c.has(id) ? c.delete(id) : c.add(id); return c; });

    return (
        <section style={box}>
            <h2>2) Pages (event_detail)</h2>
            <div style={grid2}>
                <label>
                    Gallery ID
                    <input value={galleryId} onChange={e => setGalleryId(e.target.value)} placeholder="UUID" />
                </label>
                <div style={row}>
                    <button type="button" onClick={async () => {
                        const rows = await get<Page[]>(`/api/pages?galleryId=${encodeURIComponent(galleryId)}&kind=event_detail`);
                        setPages(rows);
                        setSelectedIds(new Set());
                    }}>Load pages</button>
                </div>
            </div>

            {pages.length > 0 && (
                <>
                    <div style={{ margin: "8px 0" }}>Selected pages: {selectedCount}</div>
                    <table style={table}>
                        <thead><tr><th></th><th>URL</th><th>Status</th></tr></thead>
                        <tbody>
                            {pages.map(p => (
                                <tr key={p.id}>
                                    <td><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggle(p.id)} /></td>
                                    <td><a href={p.url} target="_blank" rel="noreferrer">{p.normalized_url}</a></td>
                                    <td>{p.fetch_status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={row}>
                        <button type="button" disabled={!selectedCount} onClick={async () => {
                            const { id } = await post<{ id: string }>("/api/pages/scrape", { pageIds: [...selectedIds] });
                            alert(`Scrape workflow started: ${id}`);
                        }}>Scrape selected</button>

                        <button type="button" disabled={!selectedCount} onClick={async () => {
                            const { id } = await post<{ id: string }>("/api/pages/extract", { pageIds: [...selectedIds] });
                            alert(`Extraction workflow started: ${id}`);
                        }}>Extract selected</button>
                    </div>
                </>
            )}
        </section>
    );
}


