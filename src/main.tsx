import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { initStore } from "./lib/initStore";
import { AuthProvider } from "./lib/AuthContext";
import App from "./App";

// Seed localStorage on first load
initStore();

const root = document.getElementById("app");
if (!root) throw new Error("Root element #app not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
