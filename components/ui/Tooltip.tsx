"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface TooltipProps {
  content: string;
  copyable?: boolean;
  copyText?: string;
  children: React.ReactNode;
}

export function Tooltip({ content, copyable = false, copyText, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(copyText || content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-auto">
          <div className="bg-[#141414] border border-[#2a2a2a] text-[10px] font-mono text-zinc-300 px-2.5 py-1.5 shadow-xl shadow-black flex items-center gap-2 whitespace-nowrap rounded-none">
            <span>{content}</span>
            {copyable && (
              <button
                onClick={handleCopy}
                className="text-zinc-500 hover:text-amber-400 p-0.5 transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
