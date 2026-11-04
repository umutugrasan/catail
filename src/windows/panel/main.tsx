import { createRoot } from "react-dom/client";
import { Panel } from "./Panel";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import "./panel.css";

createRoot(document.getElementById("root")!).render(<Panel />);
