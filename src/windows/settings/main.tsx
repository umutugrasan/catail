import { createRoot } from "react-dom/client";
import { Settings } from "./Settings";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import { initCat } from "../../lib/cat";
import { initI18n } from "../../lib/i18n";
import "./settings.css";

// Strings first: the language comes from the app.
void Promise.all([initI18n(), initCat({ paintCustom: true })]).then(() => createRoot(document.getElementById("root")!).render(<Settings />));
