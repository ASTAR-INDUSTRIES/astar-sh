import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./App";
import { QuickCapture } from "./QuickCapture";

const root = document.getElementById("root")!;
const label = getCurrentWindow().label;

createRoot(root).render(
  <React.StrictMode>
    {label === "quick" ? <QuickCapture /> : <App />}
  </React.StrictMode>,
);
