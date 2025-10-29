import { useMemo, useState } from "react";
import { box, grid2, row, table } from "../uiStyles";

type EventRow = { id: string; title: string; start_at?: string; status: string; page_id?: string };

type Props = {
    get: <T = unknown>(path: string) => Promise<T>;
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
};

export function EventsSection({ get, post }: Props) {
    const [galleryId, setGalleryId] = useState("");
    const [events, setEvents] = useState<EventRow[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
    const toggle = (id: string) => setSelectedIds(prev => { const c = new Set(prev); c.has(id) ? c.delete(id) : c.add(id); return c; });

    return (
        <section style={box}>
            <h2>3) Events</h2>
            <div style={grid2}>
                <label>
                    Gallery ID
                    <input value={galleryId} onChange={e => setGalleryId(e.target.value)} placeholder="UUID" />
                </label>
                <div style={row}>
                    <button type="button" onClick={async () => {
                        const rows = await get<EventRow[]>(`/api/events?galleryId=${encodeURIComponent(galleryId)}`);
                        setEvents(rows);
                        setSelectedIds(new Set());
                    }}>Load events</button>
                </div>
            </div>

            {events.length > 0 && (
                <>
                    <div style={{ margin: "8px 0" }}>Selected events: {selectedCount}</div>
                    <table style={table}>
                        <thead><tr><th></th><th>Title</th><th>Start</th><th>Status</th></tr></thead>
                        <tbody>
                            {events.map(ev => (
                                <tr key={ev.id}>
                                    <td><input type="checkbox" checked={selectedIds.has(ev.id)} onChange={() => toggle(ev.id)} /></td>
                                    <td>{ev.title}</td>
                                    <td>{ev.start_at ?? ""}</td>
                                    <td>{ev.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={row}>
                        <button type="button" disabled={!selectedCount} onClick={async () => {
                            const { id } = await post<{ id: string }>("/api/embed/events", { eventIds: [...selectedIds] });
                            alert(`Embedding workflow started: ${id}`);
                        }}>Embed selected</button>
                    </div>
                </>
            )}
        </section>
    );
}


