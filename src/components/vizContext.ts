"use client";
import { createContext, useContext } from "react";
import type { LivePlay } from "@/lib/live";

/** Tap a play row to replay it on the field; the row being drawn now is marked. */
export const VizCtx = createContext<{ replay: (p: LivePlay) => void; current: string | null }>({ replay: () => {}, current: null });
export const useViz = () => useContext(VizCtx);
