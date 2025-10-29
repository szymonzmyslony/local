import { useState } from "react";
import { box, row } from "../uiStyles";

type Props = {
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
};

export function DiscoverLinksSection({ post }: Props) {
    const [galleryId, setGalleryId] = useState("");
    const [listUrls, setListUrls] = useState("");

    return (
        <section style={box}>
            <h2>1) Discover event links</h2>
            <label>
                Gallery ID
                <input value={galleryId} onChange={e => setGalleryId(e.target.value)} placeholder="UUID" />
            </label>
            <label>
                Event list URLs (one per line)
                <textarea rows={4} value={listUrls} onChange={e => setListUrls(e.target.value)} placeholder="https://site.com/events" />
            </label>
            <div style={row}>
                <button type="button" onClick={async () => {
                    const urls = listUrls.split("\n").map(s => s.trim()).filter(Boolean);
                    const { id } = await post<{ id: string }>("/api/links/discover", { galleryId, listUrls: urls, limit: 100 });
                    alert(`Discover workflow started: ${id}`);
                }}>Discover (save up to 100)</button>
            </div>
        </section>
    );
}


