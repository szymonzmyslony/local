import { Card, CardBody, CardSubtitle, CardTitle } from "@shared/ui";
import { EventsView } from "../features/events/EventsView";
import { useGalleryRoute } from "./GalleryDetailLayout";

export function GalleryEventsPage() {
  const {
    pipeline,
    loadingPipeline,
    pendingAction,
    runProcessEvents,
    runEmbedEvents
  } = useGalleryRoute();

  if (loadingPipeline) {
    return (
      <Card>
        <CardBody>
          <CardTitle>Loading events</CardTitle>
          <CardSubtitle>Fetching structured events and embeddings…</CardSubtitle>
        </CardBody>
      </Card>
    );
  }

  if (!pipeline) {
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
      events={pipeline.events}
      pages={pipeline.pages}
      pendingAction={pendingAction}
      onProcessEventPages={pageIds => {
        void runProcessEvents(pageIds);
      }}
      onEmbedEvents={eventIds => {
        void runEmbedEvents(eventIds);
      }}
    />
  );
}
