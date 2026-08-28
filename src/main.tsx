import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error('Missing #root element — check index.html');

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
