"use client";

import { itemOf, type Item, type Look } from "@/lib/coinsCore";

/** Original jersey art: plain shapes and stripes, no team marks. */
export function JerseyArt({ item, size = 40, initial }: { item: Item | null; size?: number; initial?: string }) {
  const [a, b] = item?.colors ?? ["#7c3aed", "#efe8ff"];
  const st = item?.style ?? "solid";
  const id = `j${(item?.id ?? "x").replace(/\W/g, "")}${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={st === "fade" ? b : a} /></linearGradient>
        <clipPath id={`${id}c`}><path d="M13 7l4-2h6l4 2 7 4-3 7-4-2v19H13V16l-4 2-3-7z" /></clipPath>
      </defs>
      <rect width="40" height="40" fill="#0b0716" />
      <g clipPath={`url(#${id}c)`}>
        <rect width="40" height="40" fill={`url(#${id}g)`} />
        {st === "pin" ? [15, 19, 23, 27].map((x) => <rect key={x} x={x} y="0" width="0.8" height="40" fill={b} opacity=".7" />) : null}
        {st === "sleeve" ? <><rect x="0" y="8" width="13" height="12" fill={b} /><rect x="27" y="8" width="13" height="12" fill={b} /></> : null}
        {st === "chevron" ? <path d="M13 14l7 5 7-5v4l-7 5-7-5z" fill={b} /> : null}
      </g>
      <path d="M17 5q3 3 6 0" stroke={b} strokeWidth="1.2" fill="none" />
      {initial ? <text x="20" y="27" textAnchor="middle" fontSize="9" fontWeight="900" fill={st === "solid" ? b : "#fff"} fontFamily="system-ui">{initial}</text> : null}
    </svg>
  );
}

/** Avatar = equipped jersey inside the equipped frame. */
export function Avatar({ handle, look, size = 32 }: { handle: string; look?: Look; size?: number }) {
  const frame = look?.frame ? itemOf(look.frame) : null;
  const jersey = itemOf(look?.jersey ?? "j-home");
  const style = { "--f1": frame?.colors?.[0], "--f2": frame?.colors?.[1], "--glow": frame?.colors?.[1] } as React.CSSProperties;
  return (
    <span className={`cos-av ${frame ? `frame-${frame.style}` : ""} ${frame?.anim ? `anim-${frame.anim}` : ""}`} style={{ ...style, width: size, height: size }}>
      <JerseyArt item={jersey} size={size} initial={handle.slice(0, 2).toUpperCase()} />
    </span>
  );
}

export function Tag({ id }: { id?: string }) {
  const t = id ? itemOf(id) : null;
  if (!t || t.kind !== "tag") return null;
  return <span className={`cos-tag ${t.anim ? `anim-${t.anim}` : ""}`} style={{ "--t1": t.colors?.[0], "--t2": t.colors?.[1], "--glow": t.colors?.[0] } as React.CSSProperties}>{t.label}</span>;
}

export const fontClass = (look?: Look) => {
  const f = look?.font ? itemOf(look.font) : null;
  return f?.kind === "font" ? `font-${f.style}-chat` : "";
};

/** Name with tag and font, used in chat, positions and profiles. */
export function StyledName({ handle, look, className = "" }: { handle: string; look?: Look; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <b className={`font-bold text-white ${fontClass(look)}`}>@{handle}</b>
      <Tag id={look?.tag} />
    </span>
  );
}

/** Small preview art for a shop/inventory tile. */
export function ItemArt({ item, size = 56 }: { item: Item; size?: number }) {
  if (item.kind === "emote") return <span style={{ fontSize: size * 0.62, lineHeight: 1 }} className={item.rarity === "legendary" ? "anim-particles relative" : ""}>{item.icon}</span>;
  if (item.kind === "jersey") return <span className={`relative overflow-hidden rounded-xl ${item.anim ? `anim-${item.anim}` : ""}`}><JerseyArt item={item} size={size} /></span>;
  if (item.kind === "frame") return <Avatar handle="PJ" look={{ frame: item.id }} size={size * 0.7} />;
  if (item.kind === "tag") return <Tag id={item.id} />;
  if (item.kind === "font") return <span className={`text-[15px] ${fontClass({ font: item.id })}`}>@you</span>;
  const l = item.look!;
  return (
    <span className="relative block overflow-hidden rounded-xl border border-white/10" style={{ width: size * 1.3, height: size, background: `radial-gradient(120% 70% at 50% 0%, ${l.glow}, transparent 70%), ${l.bg}` }}>
      <span className="absolute left-2 top-2 h-1.5 w-10 rounded-full" style={{ background: l.accent }} />
      <span className="absolute left-2 top-5 h-1 w-6 rounded-full" style={{ background: l.accent2, opacity: 0.8 }} />
      <span className="absolute inset-x-2 bottom-2 h-4 rounded-md border" style={{ borderColor: `${l.accent}66` }} />
    </span>
  );
}
