import { createRoot } from "react-dom/client";
import { Badge } from "./Badge";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import "./badge.css";

createRoot(document.getElementById("root")!).render(<Badge />);
