/** One book only: DraftKings when ESPN sends it. Never a second book, never a blended price. Pure. */
export function isDraftKings(provider: unknown): boolean {
  if (!provider || typeof provider !== "object") return false;
  const p = provider as Record<string, unknown>;
  return String(p.id ?? "") === "100" || /draft\s*kings/i.test(String(p.name ?? p.displayName ?? ""));
}

/** The DraftKings entry from an ESPN odds list, else the first entry. */
export function pickDk<T>(list: T[]): T | undefined {
  return list.find((o) => isDraftKings((o as Record<string, unknown> | null)?.provider)) ?? list[0];
}
