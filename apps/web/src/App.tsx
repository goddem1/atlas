import { DashboardPage } from "./pages/DashboardPage";
import { NewsFeedbackReview } from "./pages/admin/NewsFeedbackReview";

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/admin/news-feedback") {
    return <NewsFeedbackReview />;
  }
  return <DashboardPage />;
}
