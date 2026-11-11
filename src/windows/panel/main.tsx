import { createRoot } from "react-dom/client";
import { Panel } from "./Panel";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import { initCat } from "../../lib/cat";
import { initI18n } from "../../lib/i18n";
import "./panel.css";
import { LIST } from "./layout";

// The styles for each layout hang off this.
document.documentElement.dataset.layout = LIST ? "list" : "grid";

// Strings first: the language comes from the app.
void Promise.all([initI18n(), initCat()]).then(() => createRoot(document.getElementById("root")!).render(<Panel />));
