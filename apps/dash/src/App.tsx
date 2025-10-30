import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardProvider } from "./providers/dashboard-context";
import { GalleryListPage } from "./routes/GalleryListPage";
import { GalleryDetailLayout } from "./routes/GalleryDetailLayout";
import { GalleryOverviewPage } from "./routes/GalleryOverviewPage";
import { GalleryPagesPage } from "./routes/GalleryPagesPage";
import { GalleryEventsPage } from "./routes/GalleryEventsPage";

export default function App() {
  return (
    <BrowserRouter>
      <DashboardProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/gallery-list" replace />} />
          <Route path="/gallery-list" element={<GalleryListPage />} />
          <Route path="/galleries/:galleryId" element={<GalleryDetailLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<GalleryOverviewPage />} />
            <Route path="pages" element={<GalleryPagesPage />} />
            <Route path="events" element={<GalleryEventsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/gallery-list" replace />} />
        </Routes>
      </DashboardProvider>
    </BrowserRouter>
  );
}
