"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { scroller } from "@/lib/scroller";

/** New page starts at the top of the page scroller (Next only resets the window). */
export default function ScrollReset() {
  const path = usePathname();
  useLayoutEffect(() => {
    const el = scroller();
    if (el && !window.location.hash) el.scrollTop = 0;
  }, [path]);
  return null;
}
