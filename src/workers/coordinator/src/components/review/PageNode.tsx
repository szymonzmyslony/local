import { CaretDown, CaretRight, ArrowSquareOut } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

interface PageNodeProps {
  url: string;
  entityCount: number;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSelectPage: (selected: boolean) => void;
  children: ReactNode;
}

export function PageNode({
  url,
  entityCount,
  selected,
  expanded,
  onToggle,
  onSelectPage,
  children,
}: PageNodeProps) {
  const truncatedUrl = url.length > 80 ? url.substring(0, 80) + "..." : url;

  return (
    <div className="border rounded-lg mb-2">
      <div
        className="flex items-center gap-2 p-3 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onSelectPage}
          onClick={(e) => e.stopPropagation()}
        />

        {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}

        <span className="font-mono text-sm flex-1">{truncatedUrl}</span>

        <Badge variant="secondary">
          {entityCount} {entityCount === 1 ? "entity" : "entities"}
        </Badge>

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-600 hover:text-blue-800"
          title="Open page in new tab"
        >
          <ArrowSquareOut size={16} />
        </a>
      </div>

      {expanded && <div className="border-t p-4 bg-gray-50">{children}</div>}
    </div>
  );
}
