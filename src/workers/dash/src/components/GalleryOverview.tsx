import { useEffect, useState } from "react";
import { box, row } from "../uiStyles";
import type { Gallery, GalleryInfo } from "../../../../types/common";

type GalleryWithInfo = Gallery & {
    gallery_info: GalleryInfo | null;
};

type Props = {
    galleryId: string;
    get: <T = unknown>(path: string) => Promise<T>;
    post: <T = unknown>(path: string, payload: unknown) => Promise<T>;
};

export function GalleryOverview({ galleryId, get, post }: Props) {
    const [gallery, setGallery] = useState<GalleryWithInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const loadGallery = async () => {
        setLoading(true);
        try {
            const data = await get<GalleryWithInfo>(`/api/galleries/${galleryId}`);
            setGallery(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadGallery();
    }, [galleryId]);

    if (loading) return <section style={box}><p>Loading gallery...</p></section>;
    if (!gallery) return <section style={box}><p>Gallery not found</p></section>;

    const info = gallery.gallery_info;

    return (
        <section style={box}>
            <h2>{info?.name || "Gallery Overview"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                    <strong>Main URL:</strong> <a href={gallery.main_url} target="_blank" rel="noreferrer">{gallery.normalized_main_url}</a>
                </div>
                {gallery.about_url && (
                    <div>
                        <strong>About URL:</strong> <a href={gallery.about_url} target="_blank" rel="noreferrer">View</a>
                    </div>
                )}
                {info?.city && (
                    <div>
                        <strong>Location:</strong> {info.city}{info.country_code ? `, ${info.country_code}` : ""}
                    </div>
                )}
                {info?.address && (
                    <div>
                        <strong>Address:</strong> {info.address}
                    </div>
                )}
                {info?.email && (
                    <div>
                        <strong>Email:</strong> <a href={`mailto:${info.email}`}>{info.email}</a>
                    </div>
                )}
                {info?.phone && (
                    <div>
                        <strong>Phone:</strong> {info.phone}
                    </div>
                )}
                {info?.website && (
                    <div>
                        <strong>Website:</strong> <a href={info.website} target="_blank" rel="noreferrer">Visit</a>
                    </div>
                )}
                {info?.instagram && (
                    <div>
                        <strong>Instagram:</strong> <a href={info.instagram} target="_blank" rel="noreferrer">View</a>
                    </div>
                )}
            </div>
            {info?.about && (
                <div style={{ marginBottom: "1rem" }}>
                    <strong>About:</strong>
                    <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap" }}>{info.about}</p>
                </div>
            )}
            {info?.tags && info.tags.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                    <strong>Tags:</strong> {info.tags.join(", ")}
                </div>
            )}
            <div style={row}>
                <button type="button" onClick={async () => {
                    const { id } = await post<{ id: string }>("/api/galleries/extract", { galleryId });
                    alert(`Extract gallery workflow started: ${id}`);
                }}>
                    {info ? "Re-extract Gallery Info" : "Extract Gallery Info"}
                </button>
                <button type="button" onClick={loadGallery}>Refresh</button>
            </div>
        </section>
    );
}
