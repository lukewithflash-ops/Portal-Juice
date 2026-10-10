/* eslint-disable @next/next/no-img-element */
/**
 * Reserved spot for the future Portal Juice mascot (see the artist brief).
 * Until the art lands at /brand/art-*.png, the glowing portal ring holds the space.
 * Set MASCOT_READY to true when the files exist.
 */
const MASCOT_READY = false;

export default function MascotSlot({ size = 72, pose = "hero" }: { size?: number; pose?: "hero" | "empty" }) {
  return (
    <span className="brand-slot shrink-0" style={{ width: size, height: size }} data-art={pose} aria-hidden>
      <img
        src={MASCOT_READY ? `/brand/art-${pose}.png` : "/brand/swirl-mark.png"}
        alt=""
        width={size}
        height={size}
        className={MASCOT_READY ? "h-full w-full object-contain" : "h-[62%] w-auto mix-blend-screen"}
      />
    </span>
  );
}
