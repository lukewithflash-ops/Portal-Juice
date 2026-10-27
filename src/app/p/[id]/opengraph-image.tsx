import { ImageResponse } from "next/og";
import { loadShare } from "@/lib/pickShare";

export const alt = "Portal Juice pick";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
const COLOR = { win: "#f5c542", loss: "#f43f5e", push: "#a1a1aa", open: "#a78bfa" } as const;
const WORD = { win: "WON", loss: "LOST", push: "PUSH", open: "LIVE" } as const;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const v = await loadShare((await params).id).catch(() => null);
  const legs = v?.legs.slice(0, 4) ?? [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(135deg,#07020f,#1a0b2e)", color: "#f2eee6", padding: 56 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#e879f9" }}>Portal Juice</div>
          {v ? <div style={{ display: "flex", fontSize: 40, fontWeight: 900, color: COLOR[v.result], border: `4px solid ${COLOR[v.result]}`, borderRadius: 999, padding: "4px 28px" }}>{WORD[v.result]}</div> : null}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#c4b5fd", marginTop: 16 }}>{v ? `${v.handle ? `@${v.handle}` : "Portal Juice bettor"} · ${v.parlay ? `${v.legs.length}-leg parlay` : "Single"}` : "Pick not found"}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24, flex: 1 }}>
          {legs.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 34, padding: "8px 0", borderLeft: `8px solid ${COLOR[l.status]}`, paddingLeft: 18, marginBottom: 8 }}>
              <div style={{ display: "flex" }}>{`${l.subject} ${l.market ? `${l.market} ` : ""}${l.side}`.slice(0, 48)}</div>
              <div style={{ display: "flex", fontWeight: 900 }}>{l.odds > 0 ? `+${l.odds}` : String(l.odds)}</div>
            </div>
          ))}
          {v && v.legs.length > 4 ? <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa" }}>{`+${v.legs.length - 4} more legs`}</div> : null}
        </div>
        {v ? <div style={{ display: "flex", fontSize: 32, color: "#34d399", fontWeight: 800 }}>{`Logged record ${v.record.w}-${v.record.l}-${v.record.p}${v.record.pct === null ? "" : ` · ${v.record.pct}%`} · Parlays ${v.parlayRecord.w}-${v.parlayRecord.l}-${v.parlayRecord.p}`}</div> : null}
      </div>
    ),
    size
  );
}
