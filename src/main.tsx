import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error('Missing #root element — check index.html');

registerServiceWorker();

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
