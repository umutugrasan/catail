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
    case "crop":
      return (
        <Icon>
          <path d="M7 3v12a2 2 0 0 0 2 2h12" />
          <path d="M17 21V9a2 2 0 0 0-2-2H3" />
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
    case "ellipse":
      return (
        <Icon>
          <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
        </Icon>
      );
    case "line":
      return (
        <Icon>
          <path d="M5 19 19 5" />
        </Icon>
      );
    case "eraser":
      return (
        <Icon>
          <path d="M7 20h12" />
          <path d="M4.5 14.5 13 6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L12 19H8.5z" />
          <path d="M9 10l6 6" />
        </Icon>
      );
    case "blur":
      return (
        // A soft drop with a highlight, its edge fading into specks: the classic blur tool.
        <Icon>
          <path d="M12 3.5C9 7.4 6.2 10.6 6.2 14a5.8 5.8 0 0 0 11.6 0c0-3.4-2.8-6.6-5.8-10.5Z" />
          <path d="M9.3 14.4a2.8 2.8 0 0 0 2.6 2.8" opacity="0.6" />
          <g fill="currentColor" stroke="none">
            <circle cx="20.2" cy="10.2" r="0.95" opacity="0.75" />
            <circle cx="21.6" cy="14.2" r="0.7" opacity="0.5" />
            <circle cx="20.4" cy="18" r="0.55" opacity="0.35" />
            <circle cx="3.8" cy="10.8" r="0.8" opacity="0.6" />
            <circle cx="2.6" cy="15" r="0.55" opacity="0.4" />
          </g>
        </Icon>
      );
  }
}

/** Bin whose lid tilts open on hover (see `.trash` in the stylesheets). */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="trash"
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
      <g className="trash__lid">
        <path d="M4 7h16" />
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </g>
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function ScanTextIcon() {
  return (
    <Icon size={16}>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M8 9h8M12 9v7" />
    </Icon>
  );
}

export function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <Icon size={14}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function CopyIcon() {
  return (
    <Icon>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  );
}

export function SaveIcon() {
  return (
    <Icon>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </Icon>
  );
}

/** A circled plus: start or grow the queue. Kept distinct from the copy icon's stacked sheets. */
export function QueueAddIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  );
}

export function ZoomIcon() {
  return (
    <Icon size={15}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" />
    </Icon>
  );
}

export function PasteIcon() {
  return (
    <Icon>
      <rect x="6" y="5" width="12" height="16" rx="2" />
      <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 12h6M9 16h4" />
    </Icon>
  );
}

/** Corners of the whole screen: select everything. */
export function SelectAllIcon() {
  return (
    <Icon>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="8" y="8" width="8" height="8" rx="1.5" />
    </Icon>
  );
}
