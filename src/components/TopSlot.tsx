"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/** Renders its children inside the sticky top stack (under the nav and live banner). Inline until mounted. */
export default function TopSlot({ children }: { children: React.ReactNode }) {
  const slot = useSyncExternalStore(noop, () => document.getElementById("top-stack-slot"), () => null);
  return slot ? createPortal(children, slot) : <div className="-mx-4 mb-4">{children}</div>;
}
