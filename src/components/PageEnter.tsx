"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

/** Short fade-up on route change without remounting the page (keeps state and scroll). */
export default function PageEnter({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const el = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const n = el.current;
    if (!n) return;
    n.classList.remove("page-enter");
    void n.offsetWidth;
    n.classList.add("page-enter");
  }, [path]);
  return <div ref={el}>{children}</div>;
}
