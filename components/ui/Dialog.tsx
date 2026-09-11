"use client";

import React, { useEffect } from "react";
import { X, ShieldCheck, ArrowRight } from "lucide-react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  confirmLabel?: string;
  confirming?: boolean;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  children,
  confirmLabel = "EXECUTE SETTLEMENT",
  confirming = false,
}: DialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !confirming) onConfirm();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, confirming, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#0a0a0a] border border-[#262626] shadow-2xl shadow-black rounded-none flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1f1f1f] bg-[#0f0f0f]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 inline-block"></span>
            <div>
              <h3 className="text-[11px] font-mono font-bold tracking-widest text-zinc-200 uppercase">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[9px] font-mono text-zinc-500 tracking-wider uppercase">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-[10px] font-mono flex items-center gap-1 transition-colors px-1.5 py-0.5 border border-transparent hover:border-[#333]"
          >
            <span>[ESC]</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 text-[11px] font-mono">
          {children}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#1f1f1f] bg-[#0d0d0d] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400/80">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>FDC3 3.0 & CBPR+ COMPLIANT INTENT</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={confirming}
              className="px-3 py-1.5 border border-[#2a2a2a] text-zinc-400 hover:text-zinc-200 text-[11px] font-mono tracking-wider uppercase transition-colors disabled:opacity-50"
            >
              CANCEL
            </button>
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-900/60 text-black font-mono font-bold text-[11px] tracking-wider uppercase flex items-center gap-1.5 transition-colors"
            >
              {confirming ? (
                <span>DISPATCHING...</span>
              ) : (
                <>
                  <span>{confirmLabel}</span>
                  <ArrowRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
