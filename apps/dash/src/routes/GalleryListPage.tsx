import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "@shared/ui";
import type { GalleryListItem } from "../api";
import { DataTable, DataTableColumnHeader } from "../components/data-table";
import { DashboardShell } from "../components/layout";
import { Modal } from "../components/modal";
import { StatusMessages } from "../components/status";
import { SeedGalleryForm } from "../features/gallery/SeedGalleryForm";
import { useDashboard } from "../providers/dashboard-context";

export function GalleryListPage() {
  const navigate = useNavigate();
  const { galleries, loading, refreshGalleries, seedGallery, seeding } = useDashboard();
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredGalleries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return galleries;
    return galleries.filter(gallery => {
      const name = gallery.gallery_info?.name?.toLowerCase() ?? "";
      return (
        name.includes(query) ||
        gallery.normalized_main_url.toLowerCase().includes(query) ||
        gallery.main_url.toLowerCase().includes(query)
      );
    });
  }, [galleries, search]);

  const columns = useMemo<ColumnDef<GalleryListItem>[]>(
    () => [
      {
        id: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Gallery" />,
        accessorFn: row => row.gallery_info?.name ?? row.normalized_main_url,
        cell: ({ row }) => {
          const item = row.original;
          const displayName = item.gallery_info?.name ?? item.normalized_main_url;
          return (
            <button
              type="button"
              className="flex flex-col gap-1 text-left"
              onClick={() => navigate(`/galleries/${item.id}/overview`)}
            >
              <span className="font-medium text-slate-900">{displayName}</span>
              <span className="text-xs text-slate-500">{item.normalized_main_url}</span>
            </button>
          );
        },
        sortingFn: (a, b) => {
          const left = (a.original.gallery_info?.name ?? a.original.normalized_main_url).toLowerCase();
          const right = (b.original.gallery_info?.name ?? b.original.normalized_main_url).toLowerCase();
          return left.localeCompare(right);
        },
        meta: { headerClassName: "w-1/3" }
      },
      {
        accessorKey: "about_url",
        header: ({ column }) => <DataTableColumnHeader column={column} title="About page" />,
        cell: ({ row }) => {
          const value = row.original.about_url;
          if (!value) {
            return <span className="text-sm text-slate-500">—</span>;
          }
          return (
            <a
              className="text-sm text-blue-600 hover:underline"
              href={value}
              target="_blank"
              rel="noreferrer"
              onClick={event => event.stopPropagation()}
            >
              {value}
            </a>
          );
        }
      },
      {
        accessorKey: "normalized_main_url",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Website" />,
        cell: ({ row }) => (
          <a
            className="text-sm text-blue-600 hover:underline"
            href={row.original.main_url}
            target="_blank"
            rel="noreferrer"
            onClick={event => event.stopPropagation()}
          >
            {row.original.main_url}
          </a>
        ),
        meta: { headerClassName: "w-1/3" }
      },
      {
        id: "actions",
        header: " ",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/galleries/${row.original.id}/overview`)}
          >
            Open
          </Button>
        ),
        meta: { cellClassName: "w-[120px]" }
      }
    ],
    [navigate]
  );

  async function handleSeed(payload: { mainUrl: string; aboutUrl: string | null }): Promise<void> {
    setStatus(null);
    setError(null);
    try {
      const { workflowId, galleryId } = await seedGallery(payload);
      setStatus(`Seed workflow started (${workflowId})`);
      setModalOpen(false);
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
    <>
      <DashboardShell
        title="Galleries"
        subtitle="Select an existing gallery or seed a new pipeline run."
        maxWidth="5xl"
        actions={
          <>
            <Button type="button" variant="muted" onClick={() => refreshGalleries()}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
            <Button type="button" onClick={() => setModalOpen(true)}>
              Seed gallery
            </Button>
          </>
        }
      >
        <StatusMessages status={status} error={error} />
        <DataTable
          columns={columns}
          data={filteredGalleries}
          getRowId={row => row.id}
          emptyMessage={loading ? "Loading galleries..." : "No galleries found. Seed one to get started."}
          renderToolbar={() => (
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full max-w-sm items-center gap-2">
                <Input
                  placeholder="Search by name or URL…"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>
              <span className="text-sm text-slate-500">
                {filteredGalleries.length} of {galleries.length} galleries
              </span>
            </div>
          )}
        />
      </DashboardShell>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Seed gallery"
        description="Provide the main URL and optional about page to start the workflow."
        hideDefaultClose
      >
        <SeedGalleryForm
          onSubmit={handleSeed}
          onCancel={() => setModalOpen(false)}
          submitting={seeding}
        />
      </Modal>
    </>
  );
}
