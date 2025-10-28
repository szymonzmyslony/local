import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { EntityType, ExtractedArtist, ExtractedGallery, ExtractedEvent } from "../../types/curator";

interface EntityEditDialogProps {
  entityType: EntityType;
  entityId: string;
  onClose: () => void;
  onSave: () => void;
}

type EntityData = ExtractedArtist | ExtractedGallery | ExtractedEvent;

export function EntityEditDialog({ entityType, entityId, onClose, onSave }: EntityEditDialogProps) {
  const [entity, setEntity] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/extracted/${entityType}s/${entityId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch entity");
        return r.json();
      })
      .then((data: { entity: EntityData }) => {
        setEntity(data.entity);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading entity:", err);
        setLoading(false);
      });
  }, [entityId, entityType]);

  const handleSave = async () => {
    if (!entity) return;

    await fetch(`/api/extracted/${entityType}s/${entityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entity),
    });

    onSave();
    onClose();
  };

  const updateField = <K extends keyof EntityData>(field: K, value: EntityData[K]) => {
    if (!entity) return;
    setEntity({ ...entity, [field]: value });
  };

  if (loading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-gray-500">Loading...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!entity) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-red-500">Failed to load entity</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Edit {entityType.charAt(0).toUpperCase() + entityType.slice(1)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name/Title field */}
          <div>
            <Label>{entityType === "event" ? "Title" : "Name"}</Label>
            <Input
              value={
                entityType === "event"
                  ? (entity as ExtractedEvent).title
                  : "name" in entity
                  ? entity.name
                  : ""
              }
              onChange={(e) =>
                updateField(entityType === "event" ? "title" : ("name" as keyof EntityData), e.target.value as EntityData[keyof EntityData])
              }
            />
          </div>

          {/* Bio/Description */}
          {entityType !== "event" && (
            <div>
              <Label>{entityType === "gallery" ? "Description" : "Bio"}</Label>
              <Textarea
                value={
                  entityType === "artist"
                    ? (entity as ExtractedArtist).bio || ""
                    : (entity as ExtractedGallery).description || ""
                }
                onChange={(e) =>
                  updateField(
                    (entityType === "artist" ? "bio" : "description") as keyof EntityData,
                    e.target.value as EntityData[keyof EntityData]
                  )
                }
                rows={4}
              />
            </div>
          )}

          {entityType === "event" && (
            <>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={(entity as ExtractedEvent).description || ""}
                  onChange={(e) => updateField("description" as keyof EntityData, e.target.value as EntityData[keyof EntityData])}
                  rows={3}
                />
              </div>

              <div>
                <Label>Venue</Label>
                <Input
                  value={(entity as ExtractedEvent).venue_name || ""}
                  onChange={(e) => updateField("venue_name" as keyof EntityData, e.target.value as EntityData[keyof EntityData])}
                />
              </div>
            </>
          )}

          {/* Website/URL */}
          {entityType !== "event" && (
            <div>
              <Label>Website</Label>
              <Input
                value={"website" in entity ? entity.website || "" : ""}
                onChange={(e) => updateField("website" as keyof EntityData, e.target.value as EntityData[keyof EntityData])}
              />
            </div>
          )}

          {entityType === "event" && (
            <div>
              <Label>Event URL</Label>
              <Input
                value={(entity as ExtractedEvent).url || ""}
                onChange={(e) => updateField("url" as keyof EntityData, e.target.value as EntityData[keyof EntityData])}
              />
            </div>
          )}

          {/* Address (gallery only) */}
          {entityType === "gallery" && (
            <div>
              <Label>Address</Label>
              <Input
                value={(entity as ExtractedGallery).address || ""}
                onChange={(e) => updateField("address" as keyof EntityData, e.target.value as EntityData[keyof EntityData])}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
