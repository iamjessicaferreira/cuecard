import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "@shared/types";

export function useRemaining(timer: PlayerView["timer"]): number {
  const [tick, setTick] = useState(0);
  const offset = useRef(0);
  const seenServerNow = useRef(0);
  if (timer.serverNow !== seenServerNow.current) {
    seenServerNow.current = timer.serverNow;
    offset.current = timer.serverNow - Date.now();
  }
  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 200);
    return () => window.clearInterval(id);
  }, [timer.running, timer.endsAt]);
  void tick;
  if (!timer.running || timer.endsAt == null) return timer.remainingMs;
  return Math.max(0, timer.endsAt - (Date.now() + offset.current));
}

export function TimerReadout({ timer, paused }: { timer: PlayerView["timer"]; paused?: boolean }) {
  const remaining = useRemaining(timer);
  const cap = Math.round(timer.durationMs / 1000);
  const seconds = Math.min(cap, Math.ceil(remaining / 1000));
  const tone = seconds <= 10 ? "text-[#ff8d8d]" : seconds <= 20 ? "text-[var(--mango)]" : "text-[var(--cream)]";
  return (
    <div className={`text-center font-display text-7xl leading-none tabular-nums ${tone} ${paused ? "opacity-70" : ""}`}>
      {seconds}
    </div>
  );
}
