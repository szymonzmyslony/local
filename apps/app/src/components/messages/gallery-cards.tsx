import { useState } from "react";
import type { GalleryMatchItem } from "../../types/tool-results";

interface GalleryCardsProps {
  galleries: GalleryMatchItem[];
}

export function GalleryCards({ galleries }: GalleryCardsProps) {
  if (galleries.length === 0) {
    return null;
  }

  const limitedGalleries = galleries.slice(0, 5);

  return (
    <div className="w-full">
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 items-stretch">
        {limitedGalleries.map((gallery) => (
          <GalleryCard
            key={gallery.id}
            gallery={gallery}
          />
        ))}
      </div>
      {galleries.length > 5 && (
        <p className="text-[10px] text-slate-400 text-center mt-1.5">
          Showing top 5 of {galleries.length} results
        </p>
      )}
    </div>
  );
}

interface GalleryCardProps {
  gallery: GalleryMatchItem;
}

function GalleryCard({ gallery }: GalleryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const description =
    gallery.description ?? "No description available for this gallery.";

  const primaryLink = gallery.main_url ?? null;
  const needsTruncation = description.length > 200;

  return (
    <div className="flex-shrink-0 w-[340px] h-full rounded-2xl p-6 bg-gradient-to-br from-[#fff8fa] to-[#ffecef] shadow-sm hover:shadow-md transition-all duration-200">
      <h2 className="text-sm font-semibold text-gray-900">{gallery.name}</h2>

      {gallery.normalized_main_url && (
        <p className="text-xs text-gray-600 mt-1">{gallery.normalized_main_url}</p>
      )}

      <div className="mt-3">
        <p
          className={`text-xs text-gray-700 leading-relaxed ${
            !isExpanded && needsTruncation ? "line-clamp-6" : ""
          }`}
        >
          {description}
        </p>
        {needsTruncation && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-gray-600 hover:text-gray-900 mt-1 font-medium"
          >
            {isExpanded ? "read less" : "read more"}
          </button>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        {primaryLink && (
          <button
            onClick={(e) => {
              e.preventDefault();
              window.open(primaryLink, "_blank", "noopener,noreferrer");
            }}
            className="bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition text-xs font-medium"
          >
            visit gallery
          </button>
        )}
        <button
          onClick={() => {
            // TODO: Implement share functionality
          }}
          className="bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition text-xs font-medium"
        >
          share
        </button>
      </div>
    </div>
  );
}
