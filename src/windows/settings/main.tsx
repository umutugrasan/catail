import { createRoot } from "react-dom/client";
import { Settings } from "./Settings";
import "../../lib/theme.css";
import "./settings.css";

createRoot(document.getElementById("root")!).render(<Settings />);
