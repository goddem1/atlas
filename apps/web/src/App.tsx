import { useEffect, useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { NewsFeedbackReview } from "./pages/admin/NewsFeedbackReview";

/** TEMP: Safari breakpoint debug — remove after measuring iPhone viewport */
function ViewportDebug() {
  const [size, setSize] = useState(() => `${window.innerWidth}x${window.innerHeight}`);
  useEffect(() => {
    const update = () => setSize(`${window.innerWidth}x${window.innerHeight}`);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        background: "red",
        color: "white",
        zIndex: 9999,
        padding: "4px",
        fontSize: "12px",
      }}
    >
      {size}
    </div>
  );
}

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/admin/news-feedback") {
    return (
      <>
        <ViewportDebug />
        <NewsFeedbackReview />
      </>
    );
  }
  return (
    <>
      <ViewportDebug />
      <DashboardPage />
    </>
  );
}
