import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App.js";
import { SITE, SITE_SCHEMA } from "./site.js";

/** Build-time only: render the same empty-session landing page that visitors see. */
export function renderPublicPage() {
  return {
    markup: renderToString(<StrictMode><App /></StrictMode>),
    site: SITE,
    schema: SITE_SCHEMA,
  };
}
