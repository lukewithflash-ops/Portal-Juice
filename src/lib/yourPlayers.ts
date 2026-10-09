/** Find your logged players inside ESPN play text. Pure, so tests can run it. */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Patterns ESPN uses for one name: "Jalen Hurts", "J.Hurts", "J. Hurts", and the last name alone. */
export function namePattern(name: string): RegExp | null {
  const parts = name.trim().replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  const alts = [esc(`${first} ${last}`), `${esc(first[0])}\\.\\s?${esc(last)}`];
  if (last.length >= 4) alts.push(esc(last));
  return new RegExp(`(?<![A-Za-z])(?:${alts.join("|")})(?![A-Za-z])`, "i");
}

export type TaggedPart = string | { tag: string; name: string };

/** Splits text so each mention of a logged player can be styled. First mention per player only. */
export function tagPlayers(text: string, names: string[]): TaggedPart[] {
  let parts: TaggedPart[] = [text];
  for (const name of names) {
    const re = namePattern(name);
    if (!re) continue;
    let done = false;
    parts = parts.flatMap((p) => {
      if (done || typeof p !== "string") return [p];
      const m = re.exec(p);
      if (!m || m.index === undefined) return [p];
      done = true;
      return [p.slice(0, m.index), { tag: m[0], name }, p.slice(m.index + m[0].length)].filter((x) => x !== "");
    });
  }
  return parts;
}

export function mentions(text: string, name: string): boolean {
  const re = namePattern(name);
  return re ? re.test(text) : false;
}
