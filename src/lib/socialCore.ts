/** Pure social helpers (shared by the server and tests). */

/** Handle seed from the account: name first, else the email local part. Letters, numbers and _ only. */
export function handleSeed(name: string | null | undefined, email: string | null | undefined): string {
  const fromName = String(name ?? "").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "");
  const fromMail = String(email ?? "").split("@")[0].normalize("NFKD").replace(/[^A-Za-z0-9_]+/g, "");
  let b = (fromName.length >= 3 ? fromName : fromMail).slice(0, 12);
  if (b.length < 3) b = "player";
  return b;
}

/** Graded: a single leg that is no longer open, or a parlay with a loss or nothing left open. */
export function positionDone(legs: { status: string }[]): boolean {
  if (!legs.length) return true;
  if (legs.length === 1) return legs[0].status !== "open";
  return legs.some((l) => l.status === "loss") || legs.every((l) => l.status !== "open");
}

