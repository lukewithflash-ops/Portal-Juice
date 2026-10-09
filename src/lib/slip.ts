/** Read a slip's text into rows. Anything not on the page is left blank. */

export type SlipDraft = {
  subject: string;
  market: string;
  line: number;
  selection: "Over" | "Under" | null;
  odds: number | null;
};

const MARKETS: [RegExp, string][] = [
  [/pass(?:ing)?(?:\s+|-)?y(?:ar)?ds?/i, "passing yards"],
  [/rush(?:ing)?(?:\s+|-)?y(?:ar)?ds?/i, "rushing yards"],
  [/rec(?:eiving)?(?:\s+|-)?y(?:ar)?ds?/i, "receiving yards"],
  [/receptions?\b/i, "receptions"],
  [/3[- ]?(?:pointers?|pts?|pm)\b/i, "3-pointers"],
  [/rebounds?\b/i, "rebounds"],
  [/assists?\b/i, "assists"],
  [/\bpoints?\b/i, "points"],
  [/\bgoals?\b/i, "goals"],
];

function marketOf(line: string): string {
  for (const [re, label] of MARKETS) {
    if (re.test(line)) return label;
  }
  return "";
}

/** One row per line that actually contains a player and a number. */
export function parseSlipText(raw: string): SlipDraft[] {
  const rows: SlipDraft[] = [];
  const seen = new Set<string>();
  for (const chunk of raw.split(/\n+/)) {
    let line = chunk.replace(/\s+/g, " ").trim();
    if (line.length < 6) continue;
    let odds: number | null = null;
    const oddsM = line.match(/[+-]\d{3,}/);
    if (oddsM) {
      const n = Number(oddsM[0]);
      if (n <= -100 || n >= 100) odds = n;
      line = line.replace(oddsM[0], " ");
    }
    const sideM = line.match(/\b(over|under)\b/i);
    const selection = sideM ? (sideM[1].toLowerCase() === "over" ? "Over" as const : "Under" as const) : null;
    const numM = line.match(/(\d+(?:\.\d+)?)/);
    if (!numM || numM.index == null) continue;
    const propLine = Number(numM[1]);
    if (!Number.isFinite(propLine)) continue;
    const market = marketOf(line);
    const subject = line
      .slice(0, numM.index)
      .replace(/\b(over|under)\b/gi, " ")
      .replace(/[^A-Za-z .'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (subject.length < 2) continue;
    if (!selection && !market) continue;
    const key = `${subject.toLowerCase()}|${market}|${propLine}|${selection ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ subject, market, line: propLine, selection, odds });
  }
  return rows;
}

export function safeSlipUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return null;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return null;
    if (host === "169.254.169.254" || host.endsWith(".metadata.google.internal")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
