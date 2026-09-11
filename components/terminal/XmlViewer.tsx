"use client";

import React from "react";

interface XmlViewerProps {
  xml: string;
}

export function XmlViewer({ xml }: XmlViewerProps) {
  const lines = xml.trim().split("\n");

  return (
    <div className="font-mono text-[11px] leading-relaxed select-text">
      {lines.map((line, lineIdx) => (
        <div key={lineIdx} className="flex hover:bg-white/[0.02] py-0.5 group">
          {/* Line number */}
          <span className="w-9 shrink-0 text-right pr-3 text-zinc-600 select-none text-[10px] font-mono group-hover:text-zinc-500">
            {lineIdx + 1}
          </span>
          {/* Formatted XML code line */}
          <span className="flex-1 whitespace-pre">
            {renderXmlLine(line)}
          </span>
        </div>
      ))}
    </div>
  );
}

function renderXmlLine(line: string) {
  // Check for XML declaration <?xml ... ?>
  if (line.trim().startsWith("<?xml")) {
    return <span className="text-zinc-400">{line}</span>;
  }

  // Regex to match:
  // 1: leading spaces
  // 2: tag opening (<Tag or </Tag)
  // 3: attributes or text content or closing tag (> or />)
  const tokens: React.ReactNode[] = [];
  
  // A clean parser for XML tokens in a line
  const regex = /(<\/?[a-zA-Z0-9_.-]+)|(\s+[a-zA-Z0-9_.-]+="[^"]*")|(\/?>)|([^<>]+)/g;
  let match;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    const [full, tagOpen, attr, tagClose, text] = match;

    if (tagOpen) {
      // e.g. <FIToFICstmrCdtTrf or </GrpHdr
      const isClosing = tagOpen.startsWith("</");
      const tagName = isClosing ? tagOpen.slice(2) : tagOpen.slice(1);
      tokens.push(
        <span key={key++} className="text-zinc-500">
          {isClosing ? "</" : "<"}
          <span className="text-sky-400 font-semibold">{tagName}</span>
        </span>
      );
    } else if (attr) {
      // e.g. ' Ccy="USD"'
      const [attrName, ...attrValParts] = attr.trim().split("=");
      const attrVal = attrValParts.join("=");
      tokens.push(
        <span key={key++}>
          {" "}
          <span className="text-amber-400/90">{attrName}</span>
          <span className="text-zinc-500">=</span>
          <span className="text-emerald-400">{attrVal}</span>
        </span>
      );
    } else if (tagClose) {
      // e.g. > or />
      tokens.push(
        <span key={key++} className="text-zinc-500">
          {tagClose}
        </span>
      );
    } else if (text) {
      // Content between tags
      tokens.push(
        <span key={key++} className="text-zinc-100 font-medium">
          {text}
        </span>
      );
    } else {
      tokens.push(<span key={key++}>{full}</span>);
    }
  }

  if (tokens.length === 0) {
    return <span>{line}</span>;
  }

  return <>{tokens}</>;
}
