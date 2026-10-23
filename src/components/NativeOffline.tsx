"use client";

import { useEffect, useState } from "react";
import { onNativeNetwork } from "@/lib/native";

/** iOS app only: a thin bar when the phone loses its connection. Browsers never see it. */
export default function NativeOffline() {
  const [off, setOff] = useState(false);
  useEffect(() => onNativeNetwork((connected) => setOff(!connected)), []);
  if (!off) return null;
  return (
    <div
      role="status"
      data-testid="native-offline"
      className="fixed inset-x-0 top-0 z-[60] border-b border-fuchsia-400/40 bg-[#14081f]/95 px-4 pb-2 text-center text-[12px] font-bold text-fuchsia-100 backdrop-blur"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
    >
      You&apos;re offline. Scores and lines will catch up when you reconnect.
    </div>
  );
}
