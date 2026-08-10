import { useState } from "react";
import type { GallerySearchResult } from "../../services/gallery-search";

interface GalleryCardsProps {
  galleries: GallerySearchResult[];
}

export function GalleryCards({ galleries }: GalleryCardsProps) {
  if (galleries.length === 0) {
    return null;
  }

  const limitedGalleries = galleries.slice(0, 5);

  return (
    <div className="w-full">
      <div className="zine-scrollbar -mx-4 flex items-stretch gap-3 overflow-x-auto px-4 pb-3">
        {limitedGalleries.map((gallery) => (
          <GalleryCard
            key={gallery.id}
            gallery={gallery}
          />
        ))}
      </div>
      {galleries.length > 5 && (
        <p className="mt-1.5 text-center font-mono text-[10px] text-[#0140B6]/55">
          Showing top 5 of {galleries.length} results
        </p>
      )}
    </div>
  );
}

interface GalleryCardProps {
  gallery: GallerySearchResult;
}

function GalleryCard({ gallery }: GalleryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const description =
    gallery.about ?? "No description available for this gallery.";

  const primaryLink = gallery.main_url ?? null;
  const needsTruncation = description.length > 200;

  return (
    <div className="h-full w-[340px] flex-shrink-0 rounded-lg border border-[#0140B6]/30 bg-[#F1F5FF] p-6 transition-all duration-200 hover:border-[#0140B6]">
      <p className="mb-3 text-[9px] uppercase tracking-[0.18em] text-[#0140B6]/60">Gallery</p>
      <h2 className="text-lg font-semibold leading-tight text-[#0140B6]">{gallery.name}</h2>

      {gallery.district && (
        <p className="mt-1 text-xs text-[#0140B6]/70">{gallery.district}</p>
      )}

      <div className="mt-3">
        <p
          className={`text-xs leading-relaxed text-[#161A23]/80 ${
            !isExpanded && needsTruncation ? "line-clamp-6" : ""
          }`}
        >
          {description}
        </p>
        {needsTruncation && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-1 text-xs font-medium text-[#0140B6] hover:underline"
          >
            {isExpanded ? "read less" : "read more"}
          </button>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        {primaryLink && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              window.open(primaryLink, "_blank", "noopener,noreferrer");
            }}
            className="rounded-md bg-[#161A23] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#0140B6]"
          >
            visit gallery
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            // TODO: Implement share functionality
          }}
          className="rounded-md border border-[#0140B6] bg-white px-3 py-2 text-xs font-medium text-[#0140B6] transition hover:bg-[#0140B6] hover:text-white"
        >
          share
        </button>
      </div>
    </div>
  );
}
