import { useEffect, useMemo, useState } from "react";
import { box, row, table } from "../uiStyles";
import type { Event } from "../../../../types/common";

type Props = {
    galleryId: string;
    get: <T = unknown>(path: string) => Promise<T>;
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
};

export function EventsSection({ galleryId, get, post }: Props) {
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);
    const toggle = (id: string) => setSelectedIds(prev => { const c = new Set(prev); c.has(id) ? c.delete(id) : c.add(id); return c; });

    const loadEvents = async () => {
        setLoading(true);
        try {
            const rows = await get<Event[]>(`/api/events?galleryId=${encodeURIComponent(galleryId)}`);
            setEvents(rows);
            setSelectedIds(new Set());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, [galleryId]);

    return (
        <section style={box}>
            <h2>Events</h2>

            <div style={{ marginBottom: "1rem" }}>
                <strong>Total:</strong> {events.length} events
            </div>

            <div style={row}>
                <button type="button" onClick={loadEvents} disabled={loading}>
                    {loading ? "Loading..." : "Refresh"}
                </button>
            </div>

            {events.length > 0 && (
                <>
                    <div style={{ margin: "8px 0" }}>Selected: {selectedCount}</div>
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
                        }}>Embed Selected</button>
                    </div>
                </>
            )}
        </section>
    );
}


