/** The page scrolls inside #pj-scroll (not the window), so the top stack can never move on iOS. */
export function scroller(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.getElementById("pj-scroll");
}
/** Scroll target: the page scroller, or the window as a fallback. */
export function scrollTarget(): HTMLElement | Window {
  return scroller() ?? window;
}
export function scrollTop(): number {
  return scroller()?.scrollTop ?? window.scrollY;
}
