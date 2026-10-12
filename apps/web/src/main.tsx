import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

console.log("=== MAIN.TSX START ===");

const root = createRoot(document.getElementById("root")!);
console.log("=== REACT MOUNTING ===");
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
console.log("=== REACT RENDERED ===");
