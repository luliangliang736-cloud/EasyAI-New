"use client";

import {
  MousePointer2,
  Hand,
  Crosshair,
  Square,
  Type,
  Image as ImageIcon,
  Minus,
  Plus,
  ZoomIn,
} from "lucide-react";

const TOOLS = [
  { id: "select", icon: MousePointer2, label: "选择 (V)" },
  { id: "hand", icon: Hand, label: "移动 (H)" },
  { id: "mark", icon: Crosshair, label: "标记 (M)" },
  { id: "shape", icon: Square, label: "形状" },
  { id: "text", icon: Type, label: "文字" },
  { id: "image", icon: ImageIcon, label: "图片" },
];

export default function Toolbar({ activeTool, onToolChange, zoom, onZoomChange }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-bg-secondary/90 backdrop-blur-xl border border-border-primary shadow-2xl shadow-black/40">
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              isActive
                ? "bg-accent text-white shadow-lg shadow-accent/30"
                : "text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
            }`}
          >
            <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
          </button>
        );
      })}

      <div className="w-px h-6 bg-border-primary mx-1" />

      <button
        onClick={() => onZoomChange((z) => Math.max(z - 10, 25))}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all"
        title="缩小"
      >
        <Minus size={14} />
      </button>
      <button
        onClick={() => onZoomChange(100)}
        className="px-1.5 h-8 rounded-lg flex items-center justify-center text-[11px] text-text-tertiary hover:text-text-primary hover:bg-bg-hover font-mono transition-all min-w-[42px]"
        title="重置缩放"
      >
        {zoom}%
      </button>
      <button
        onClick={() => onZoomChange((z) => Math.min(z + 10, 200))}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all"
        title="放大"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
