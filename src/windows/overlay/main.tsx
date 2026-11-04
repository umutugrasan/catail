import { createRoot } from "react-dom/client";
import { Overlay } from "./Overlay";
import "../../lib/theme.css";
import "../../lib/pressCursor";
import "./overlay.css";

createRoot(document.getElementById("root")!).render(<Overlay />);
