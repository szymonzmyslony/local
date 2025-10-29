import { useState } from "react";
import { box, grid2, row, table } from "../uiStyles";

type Gallery = { id: string; main_url: string; about_url: string | null; normalized_main_url: string };

type Props = {
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
    get: <T = unknown>(path: string) => Promise<T>;
};

export function SeedGallerySection({ post, get }: Props) {
    const [mainUrl, setMainUrl] = useState("");
    const [aboutUrl, setAboutUrl] = useState("");
    const [galleries, setGalleries] = useState<Gallery[]>([]);

    return (
        <section style={box}>
            <h2>0) Seed gallery</h2>
            <div style={grid2}>
                <label>
                    Main URL
                    <input value={mainUrl} onChange={e => setMainUrl(e.target.value)} placeholder="https://example.com" />
                </label>
                <label>
                    About URL (optional)
                    <input value={aboutUrl} onChange={e => setAboutUrl(e.target.value)} placeholder="https://example.com/about" />
                </label>
            </div>
            <div style={row}>
                <button type="button" onClick={async () => {
                    const { id } = await post<{ id: string }>("/api/galleries/seed", { mainUrl, aboutUrl: aboutUrl || null });
                    alert(`Seed workflow started: ${id}`);
                }}>Seed gallery</button>

                <button type="button" onClick={async () => {
                    const list = await get<Gallery[]>("/api/galleries");
                    setGalleries(list);
                }}>List galleries</button>
            </div>
            {galleries.length > 0 && (
                <table style={table}>
                    <thead><tr><th>ID</th><th>Main</th><th>About</th></tr></thead>
                    <tbody>
                        {galleries.map(g => (
                            <tr key={g.id}>
                                <td>{g.id}</td>
                                <td><a href={g.main_url} target="_blank" rel="noreferrer">{g.normalized_main_url}</a></td>
                                <td>{g.about_url ?? ""}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}


