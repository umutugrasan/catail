import { createRoot } from "react-dom/client";
import { Preview } from "./Preview";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import { initI18n } from "../../lib/i18n";
import "./preview.css";

// Strings first: the language comes from the app.
void initI18n().then(() => createRoot(document.getElementById("root")!).render(<Preview />));
