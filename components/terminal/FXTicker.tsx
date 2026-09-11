"use client";

import { useEffect, useRef } from "react";
import { FX_PAIRS } from "@/lib/fdc3/intent-bridge";
import gsap from "gsap";

export function FXTicker() {
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!trackRef.current) return;
    const track = trackRef.current;
    const width = track.scrollWidth / 2;

    tweenRef.current = gsap.to(track, {
      x: -width,
      duration: width / 80,
      ease: "none",
      repeat: -1,
      modifiers: {
        x: gsap.utils.unitize((x) => parseFloat(x) % width),
      },
    });

    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  const items = [...FX_PAIRS, ...FX_PAIRS]; // duplicate for seamless loop

  return (
    <div className="border-b border-[#1a1a1a] bg-[#0d0d0d] h-8 overflow-hidden flex items-center">
      <div className="shrink-0 px-3 border-r border-[#1a1a1a] text-amber-500 text-[10px] font-mono tracking-widest uppercase">
        FX
      </div>
      <div className="overflow-hidden flex-1 relative">
        <div ref={trackRef} className="flex gap-0 whitespace-nowrap will-change-transform">
          {items.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-2 px-5 text-[11px] font-mono border-r border-[#1a1a1a]">
              <span className="text-zinc-400">{item.pair}</span>
              <span className="text-white font-medium tabular-nums">
                {item.rate.toFixed(item.rate > 100 ? 2 : 4)}
              </span>
              <span className={item.change > 0 ? "text-emerald-400" : "text-red-400"}>
                {item.change > 0 ? "▲" : "▼"}{" "}
                {Math.abs(item.change).toFixed(item.rate > 100 ? 2 : 4)}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-3 border-l border-[#1a1a1a] text-[10px] font-mono text-zinc-600 tracking-widest">
        DEVNET
      </div>
    </div>
  );
}
