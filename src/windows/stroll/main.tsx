import { createRoot } from "react-dom/client";
import { Stroll } from "./Stroll";
import "../../lib/theme.css";
import { initCat } from "../../lib/cat";
import "./stroll.css";

void initCat().then(() => createRoot(document.getElementById("root")!).render(<Stroll />));
