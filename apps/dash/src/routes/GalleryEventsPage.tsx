import { useEffect, useState } from "react";
import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { EventsView } from "../features/events/EventsView";
import { useGalleryRoute } from "./GalleryDetailLayout";
import { fetchGalleryEvents, fetchGalleryPages, type GalleryEvent, type GalleryPage } from "../api";

export function GalleryEventsPage() {
  const {
    galleryId,
    loadingGallery,
    pendingAction,
    dataVersion,
    runProcessEvents,
    setError
  } = useGalleryRoute();

  const [events, setEvents] = useState<GalleryEvent[]>([]);
  const [pages, setPages] = useState<GalleryPage[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!galleryId) {
      setEvents([]);
      setPages([]);
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    Promise.all([fetchGalleryEvents(galleryId), fetchGalleryPages(galleryId)])
      .then(([eventRows, pageRows]) => {
        if (cancelled) return;
        setEvents(eventRows);
        setPages(pageRows);
      })
      .catch(issue => {
        if (cancelled) return;
        const message = issue instanceof Error ? issue.message : String(issue);
        setError(message);
        setEvents([]);
        setPages([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingData(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [galleryId, dataVersion, setError]);

  if (loadingGallery || loadingData) {
    return (
      <Card>
        <CardBody>
          <CardTitle>Loading events</CardTitle>
          <CardSubtitle>Fetching structured events…</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  if (!galleryId) {
    return (
      <Card>
        <CardBody>
          <CardTitle>No events yet</CardTitle>
          <CardSubtitle>
            Run the discovery and scraping workflows to populate events for this gallery.
          </CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  return (
    <EventsView
      events={events}
      pages={pages}
      pendingAction={pendingAction}
      onProcessEventPages={pageIds => {
        void runProcessEvents(pageIds);
      }}
    />
  );
}
