import { createRoot } from "react-dom/client";
import { Badge } from "./Badge";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import { initCat } from "../../lib/cat";
import { initI18n } from "../../lib/i18n";
import "./badge.css";

// Strings first: the language comes from the app.
void Promise.all([initI18n(), initCat()]).then(() => createRoot(document.getElementById("root")!).render(<Badge />));
