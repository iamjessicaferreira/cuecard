import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GAME_NAME } from "@shared/config";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { readLocale } from "./lib/storage";
import "./styles.css";

document.title = GAME_NAME;
document.documentElement.lang = readLocale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
