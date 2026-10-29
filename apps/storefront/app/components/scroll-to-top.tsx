"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Opens every new page at the top. Next.js only scrolls when the new page's
 * top isn't already on screen; while a page is still loading it is short, so
 * the browser can leave you at the bottom (the footer) and the content then
 * appears above you. Back/forward keep their position, and #anchor links are
 * left alone.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const first = useRef(true);
  const backOrForward = useRef(false);

  useEffect(() => {
    const onPop = () => { backOrForward.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; } // first load: the browser decides
    if (backOrForward.current) { backOrForward.current = false; return; }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
