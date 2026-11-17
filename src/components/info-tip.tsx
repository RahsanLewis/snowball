"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

// Small (i) button that opens one or two lines of context in a native popover.
// Light dismiss and Esc come from the browser; CSS anchors it to the button where supported.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const anchor = `--tip-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <>
    <button type="button" className="info-tip" popoverTarget={id} aria-label={label} style={{ anchorName: anchor } as CSSProperties}>i</button>
    <span id={id} popover="auto" className="info-pop" style={{ positionAnchor: anchor } as CSSProperties}>{children}</span>
  </>;
}
