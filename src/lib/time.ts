const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});
const fmtShort = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});
const fmtDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

export const ptDayTime = (iso: string) => `${fmt.format(new Date(iso))} PT`;
export const ptTime = (iso: string) => `${fmtShort.format(new Date(iso))} PT`;
/** For YYYY-MM-DD strings. */
export const shortDate = (ymd: string) => fmtDate.format(new Date(`${ymd.slice(0, 10)}T12:00:00Z`));
