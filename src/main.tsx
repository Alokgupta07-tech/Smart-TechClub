import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.tsx";
import "./index.css";

// QueryClient is now only created in App.tsx to avoid duplicate instances
// which was causing memory leaks and unnecessary re-renders

const rootElement = document.getElementById("root");
if (!rootElement) {
  const fallbackRoot = document.createElement("div");
  fallbackRoot.id = "root";
  document.body.appendChild(fallbackRoot);
}

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <Analytics />
  </>
);

