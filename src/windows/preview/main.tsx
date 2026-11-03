import { createRoot } from "react-dom/client";
import { Preview } from "./Preview";
import "../../lib/theme.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(<Preview />);
