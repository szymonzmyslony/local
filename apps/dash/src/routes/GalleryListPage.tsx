import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardSubtitle,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Badge
} from "@shared/ui";
import { SeedGalleryForm } from "../features/gallery/SeedGalleryForm";
import { useDashboard } from "../providers/dashboard-context";

export function GalleryListPage() {
  const navigate = useNavigate();
  const { galleries, loading, refreshGalleries, seedGallery, seeding } = useDashboard();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasGalleries = useMemo(() => galleries.length > 0, [galleries]);

  async function handleSeed(payload: { mainUrl: string; aboutUrl: string | null }): Promise<void> {
    setStatus(null);
    setError(null);
    try {
      const { workflowId, galleryId } = await seedGallery(payload);
      setStatus(`Seed workflow started (${workflowId})`);
      setDialogOpen(false);
      if (galleryId) {
        navigate(`/galleries/${galleryId}/overview`);
      } else {
        await refreshGalleries();
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">Gallery list</h1>
          <p className="text-sm text-slate-600">Select a gallery or seed a new one to begin a pipeline run.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="muted" onClick={() => refreshGalleries()}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button">Seed gallery</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Seed gallery</DialogTitle>
                <DialogDescription>Provide the primary URL and optional about page to start the pipeline.</DialogDescription>
              </DialogHeader>
              <SeedGalleryForm
                onSubmit={handleSeed}
                onCancel={() => setDialogOpen(false)}
                submitting={seeding}
              />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {status ? (
        <Badge variant="secondary" className="w-fit">
          {status}
        </Badge>
      ) : null}
      {error ? (
        <Badge variant="destructive" className="w-fit">
          {error}
        </Badge>
      ) : null}

      {!hasGalleries && !loading ? (
        <Card>
          <CardBody className="space-y-2">
            <CardTitle>No galleries yet</CardTitle>
            <CardSubtitle>Use the seed gallery button above to create your first pipeline run.</CardSubtitle>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4">
          {galleries.map(gallery => (
            <Card
              key={gallery.id}
              className="cursor-pointer transition hover:border-slate-300 hover:shadow-sm"
              onClick={() => navigate(`/galleries/${gallery.id}/overview`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  {gallery.gallery_info?.name ?? gallery.main_url}
                </CardTitle>
                <CardSubtitle>{gallery.normalized_main_url}</CardSubtitle>
              </CardHeader>
              <CardBody className="flex items-center justify-between text-sm text-slate-600">
                <span>{gallery.about_url ?? "No about page provided"}</span>
                <Button
                  type="button"
                  variant="muted"
                  onClick={event => {
                    event.stopPropagation();
                    navigate(`/galleries/${gallery.id}/overview`);
                  }}
                >
                  Open
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
