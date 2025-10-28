import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BulkActionsBarProps {
  selectedEntities: number;
  selectedPages: number;
  onApprove: () => void;
  onReject: () => void;
  onTriggerSimilarity: () => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedEntities,
  selectedPages,
  onApprove,
  onReject,
  onTriggerSimilarity,
  onClearSelection
}: BulkActionsBarProps) {
  if (selectedEntities === 0 && selectedPages === 0) return null;

  return (
    <div className="sticky bottom-0 bg-white border-t p-4 flex items-center justify-between shadow-lg z-10">
      <div className="flex items-center gap-2">
        {selectedPages > 0 && (
          <Badge variant="outline">
            {selectedPages} {selectedPages === 1 ? "page" : "pages"}
          </Badge>
        )}
        {selectedEntities > 0 && (
          <Badge variant="outline">
            {selectedEntities} {selectedEntities === 1 ? "entity" : "entities"}
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClearSelection}>
          Clear Selection
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReject}
          disabled={selectedPages === 0 && selectedEntities === 0}
        >
          Reject
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onApprove}
          disabled={selectedPages === 0 && selectedEntities === 0}
        >
          Approve
        </Button>
        <Button
          size="sm"
          onClick={onTriggerSimilarity}
          disabled={selectedPages === 0 && selectedEntities === 0}
        >
          Approve & Queue for Similarity
        </Button>
      </div>
    </div>
  );
}
