"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface Option {
  pair: string;
  rate: number;
  change: number;
  currency: string;
}

interface SelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function InstitutionalSelect({ options, value, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.pair === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#111111] hover:bg-[#141414] border border-[#222222] focus:border-amber-500/60 text-left px-2.5 py-1.5 text-[11px] font-mono flex items-center justify-between transition-colors rounded-none outline-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">{selected.pair}</span>
          <span className="text-zinc-500">|</span>
          <span className="text-zinc-400 tabular-nums">
            {selected.rate.toFixed(selected.rate > 100 ? 2 : 4)}
          </span>
          <span
            className={`text-[10px] tabular-nums ${
              selected.change >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {selected.change >= 0 ? "+" : ""}
            {selected.change.toFixed(selected.rate > 100 ? 2 : 4)}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
            open ? "rotate-180 text-amber-400" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#0e0e0e] border border-[#262626] shadow-2xl shadow-black z-50 max-h-56 overflow-y-auto rounded-none">
          <div className="px-2 py-1 bg-[#141414] border-b border-[#222] text-[9px] font-mono text-zinc-500 tracking-wider uppercase flex justify-between">
            <span>PAIR</span>
            <span>RATE / 24H</span>
          </div>
          {options.map((opt) => {
            const isSelected = opt.pair === value;
            return (
              <div
                key={opt.pair}
                onClick={() => {
                  onChange(opt.pair);
                  setOpen(false);
                }}
                className={`px-2.5 py-1.5 text-[11px] font-mono flex items-center justify-between cursor-pointer border-b border-[#161616] last:border-b-0 hover:bg-[#1a1a1a] transition-colors ${
                  isSelected ? "bg-[#181818] text-amber-400" : "text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <Check className="w-3 h-3 text-amber-400" />
                  ) : (
                    <div className="w-3 h-3" />
                  )}
                  <span className="font-semibold">{opt.pair}</span>
                </div>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-zinc-400">
                    {opt.rate.toFixed(opt.rate > 100 ? 2 : 4)}
                  </span>
                  <span
                    className={`text-[10px] w-14 text-right ${
                      opt.change >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {opt.change >= 0 ? "+" : ""}
                    {opt.change.toFixed(opt.rate > 100 ? 2 : 4)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
