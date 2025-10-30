import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { listGalleries, seedGallery, type GalleryListItem } from "../api";
import { normalizeUrl } from "../../workflows/utils/normalizeUrl";

type SeedPayload = { mainUrl: string; aboutUrl: string | null };

type SeedResult = {
  workflowId: string;
  galleryId: string | null;
};

type DashboardContextValue = {
  galleries: GalleryListItem[];
  loading: boolean;
  refreshGalleries: () => Promise<GalleryListItem[]>;
  seeding: boolean;
  seedGallery: (payload: SeedPayload) => Promise<SeedResult>;
};

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const refreshGalleries = useCallback(async (): Promise<GalleryListItem[]> => {
    setLoading(true);
    try {
      const data = await listGalleries();
      setGalleries(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGalleries();
  }, [refreshGalleries]);

  const handleSeedGallery = useCallback(
    async ({ mainUrl, aboutUrl }: SeedPayload): Promise<SeedResult> => {
      setSeeding(true);
      try {
        const workflowId = await seedGallery({ mainUrl, aboutUrl });
        const updated = await refreshGalleries();
        const normalized = normalizeUrl(mainUrl);
        const match = updated.find(gallery => gallery.normalized_main_url === normalized);
        return {
          workflowId,
          galleryId: match?.id ?? null,
        };
      } finally {
        setSeeding(false);
      }
    },
    [refreshGalleries]
  );

  const value = useMemo<DashboardContextValue>(
    () => ({
      galleries,
      loading,
      refreshGalleries,
      seeding,
      seedGallery: handleSeedGallery,
    }),
    [galleries, loading, refreshGalleries, seeding, handleSeedGallery]
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return ctx;
}
