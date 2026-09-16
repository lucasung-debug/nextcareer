import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import App from "./App.js";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("root element missing");

const app = <StrictMode><App /></StrictMode>;
// Production HTML already contains this same landing page. Dev keeps an empty root.
if (el.hasChildNodes()) hydrateRoot(el, app);
else createRoot(el).render(app);
