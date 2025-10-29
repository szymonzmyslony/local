import { useEffect, useState } from "react";
import { box, grid2, row, table } from "../uiStyles";
import type { Gallery } from "../../../../types/common";

type Props = {
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
    get: <T = unknown>(path: string) => Promise<T>;
    onGalleryCreated: (id: string) => void;
    onGallerySelected: (id: string) => void;
};

export function SeedGallerySection({ post, get, onGalleryCreated, onGallerySelected }: Props) {
    const [mainUrl, setMainUrl] = useState("");
    const [aboutUrl, setAboutUrl] = useState("");
    const [galleries, setGalleries] = useState<Gallery[]>([]);
    const [loading, setLoading] = useState(false);

    const loadGalleries = async () => {
        setLoading(true);
        try {
            const list = await get<Gallery[]>("/api/galleries");
            setGalleries(list);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadGalleries();
    }, []);

    return (
        <section style={box}>
            <h2>Galleries</h2>
            <div style={grid2}>
                <label>
                    Main URL
                    <input value={mainUrl} onChange={e => setMainUrl(e.target.value)} placeholder="https://gallery.com" />
                </label>
                <label>
                    About URL (optional)
                    <input value={aboutUrl} onChange={e => setAboutUrl(e.target.value)} placeholder="https://gallery.com/about" />
                </label>
            </div>
            <div style={row}>
                <button type="button" onClick={async () => {
                    const { id } = await post<{ id: string }>("/api/galleries/seed", { mainUrl, aboutUrl: aboutUrl || null });
                    alert(`Seed workflow started: ${id}`);
                    await loadGalleries();
                    onGalleryCreated(id);
                    setMainUrl("");
                    setAboutUrl("");
                }}>Seed New Gallery</button>

                <button type="button" onClick={loadGalleries} disabled={loading}>
                    {loading ? "Loading..." : "Refresh Galleries"}
                </button>
            </div>
            {galleries.length > 0 && (
                <table style={table}>
                    <thead>
                        <tr>
                            <th>Main URL</th>
                            <th>About URL</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {galleries.map(g => (
                            <tr key={g.id}>
                                <td><a href={g.main_url} target="_blank" rel="noreferrer">{g.normalized_main_url}</a></td>
                                <td>{g.about_url ? <a href={g.about_url} target="_blank" rel="noreferrer">About</a> : ""}</td>
                                <td>
                                    <button type="button" onClick={() => onGallerySelected(g.id)}>Select</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}


