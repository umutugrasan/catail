// Stroke icons for the overlay. 24×24 viewBox, drawn in currentColor.
import type { ReactNode } from "react";
import type { Tool } from "./draw";

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CameraIcon() {
  return (
    <Icon size={16}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  );
}

export function TextModeIcon() {
  return (
    <Icon size={16}>
      <path d="M5 6h14M12 6v13M9 19h6" />
    </Icon>
  );
}

export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  );
}

export function ToolIcon({ tool }: { tool: Tool }) {
  switch (tool) {
    case "select":
      return (
        <Icon>
          <path d="M5 3l14 8-6 1.5L10 19z" />
        </Icon>
      );
    case "arrow":
      return (
        <Icon>
          <path d="M5 19 19 5M10 5h9v9" />
        </Icon>
      );
    case "rect":
      return (
        <Icon>
          <rect x="4" y="6" width="16" height="12" rx="1" />
        </Icon>
      );
    case "pen":
      return (
        <Icon>
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
        </Icon>
      );
    case "highlighter":
      return (
        <Icon>
          <path d="M9 15l-3 3h5l1-1M9 15l7-10 4 3-7 10zM9 15l4 3" />
        </Icon>
      );
    case "text":
      return (
        <Icon>
          <path d="M5 6h14M12 6v13" />
        </Icon>
      );
    case "blur":
      return (
        <Icon>
          <rect x="4" y="4" width="5" height="5" />
          <rect x="15" y="4" width="5" height="5" />
          <rect x="9.5" y="9.5" width="5" height="5" />
          <rect x="4" y="15" width="5" height="5" />
          <rect x="15" y="15" width="5" height="5" />
        </Icon>
      );
  }
}
