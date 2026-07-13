import { Navigate } from "react-router-dom";

export default function SongLibraryPage() {
  return <Navigate to="/settings?tab=library" replace />;
}
