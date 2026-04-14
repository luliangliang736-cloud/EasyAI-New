"use client";

import {
  useState, useRef, useCallback, useEffect,
  useReducer, useImperativeHandle,
} from "react";
import {
  Maximize2, Download, Trash2, Copy,
  MessageSquare, Lock, Unlock, FileDown, Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import Toolbar from "@/components/Toolbar";

const INITIAL_IMG_WIDTH = 280;

function ContextMenu({ x, y, img, isLocked, onClose, onAction }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    window.addEventListener("pointerdown", handle);
    return () => window.removeEventListener("pointerdown", handle);
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.right > vw) menuRef.current.style.left = `${x - rect.width}px`;
    if (rect.bottom > vh) menuRef.current.style.top = `${y - rect.height}px`;
  }, [x, y]);

  const items = [
    { id: "copy", label: "复制", icon: Copy },
    { id: "sendToChat", label: "发送到对话", icon: MessageSquare },
    { id: "export", label: "导出", icon: FileDown },
    { id: "divider" },
    { id: "lock", label: isLocked ? "解锁" : "锁定", icon: isLocked ? Unlock : Lock },
    { id: "divider2" },
    { id: "delete", label: "删除", icon: Trash2, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-bg-secondary border border-border-primary rounded-xl shadow-2xl shadow-black/60 py-1.5 min-w-[160px] animate-fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item) =>
        item.id.startsWith("divider") ? (
          <div key={item.id} className="my-1 border-t border-border-primary" />
        ) : (
          <button
            key={item.id}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors ${
              item.danger
                ? "text-red-400 hover:bg-red-500/10"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
            onClick={() => { onAction(item.id, img); onClose(); }}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

export default function Canvas({
  images, selectedImage, onSelectImage, onDeleteImage,
  onUpdateImage, onSendToChat, onDropImages,
  activeTool, onToolChange, zoom, onZoomChange,
  ref,
}) {
  const toast = useToast();
  const containerRef = useRef(null);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [action, setAction] = useState(null);
  const actionRef = useRef(null);
  const [, forceRender] = useReducer((c) => c + 1, 0);
  const [contextMenu, setContextMenu] = useState(null);
  const lockedRef = useRef(new Set());
  const [fileDragOver, setFileDragOver] = useState(false);

  actionRef.current = action;

  const positionsRef = useRef({});
  const imageMetaRef = useRef({});
  images.forEach((img, i) => {
    if (!positionsRef.current[img.id]) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      positionsRef.current[img.id] = {
        x: col * (INITIAL_IMG_WIDTH + 40) + 100,
        y: row * (INITIAL_IMG_WIDTH + 60) + 100,
        w: INITIAL_IMG_WIDTH,
      };
    }
  });

  useImperativeHandle(ref, () => ({
    exportCanvas: () => {
      if (images.length === 0) {
        toast("画布为空", "info", 1500);
        return;
      }
      const positions = positionsRef.current;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const loaded = [];
      let pending = images.length;

      images.forEach((img) => {
        const pos = positions[img.id];
        if (!pos) { pending--; return; }
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => {
          const aspect = el.naturalHeight / el.naturalWidth;
          const h = pos.w * aspect;
          minX = Math.min(minX, pos.x);
          minY = Math.min(minY, pos.y);
          maxX = Math.max(maxX, pos.x + pos.w);
          maxY = Math.max(maxY, pos.y + h);
          loaded.push({ el, x: pos.x, y: pos.y, w: pos.w, h });
          if (--pending === 0) draw();
        };
        el.onerror = () => { if (--pending === 0) draw(); };
        el.src = img.image_url;
      });

      function draw() {
        const pad = 40;
        const cw = maxX - minX + pad * 2;
        const ch = maxY - minY + pad * 2;
        const cvs = document.createElement("canvas");
        cvs.width = cw;
        cvs.height = ch;
        const ctx = cvs.getContext("2d");
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, cw, ch);
        loaded.forEach(({ el, x, y, w, h }) => {
          ctx.drawImage(el, x - minX + pad, y - minY + pad, w, h);
        });
        cvs.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `canvas-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast("画布已导出", "success");
        });
      }
    },
  }), [images, toast]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedImage && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
          if (lockedRef.current.has(selectedImage.id)) return;
          e.preventDefault();
          onDeleteImage?.(selectedImage.id);
        }
      }
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedImage, onDeleteImage]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    onZoomChange?.((prev) => Math.max(1, Math.min(200, prev + delta)));
  }, [onZoomChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const isHandTool = activeTool === "hand";

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest("[data-toolbar]")) return;
    setContextMenu(null);
    const target = e.target;
    const imgEl = target.closest("[data-canvas-item]");

    if (isHandTool) {
      setAction("pan");
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (imgEl) {
      const id = imgEl.dataset.canvasItem;
      const pos = positionsRef.current[id];
      if (!pos) return;
      const img = images.find((i) => i.id === id);
      if (img) onSelectImage(img);
      if (lockedRef.current.has(id)) return;
      setAction({
        type: "drag", id,
        startX: e.clientX, startY: e.clientY,
        origX: pos.x, origY: pos.y,
      });
    } else {
      onSelectImage(null);
      setAction("pan");
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [images, onSelectImage, isHandTool]);

  const handlePointerMove = useCallback((e) => {
    const act = actionRef.current;
    if (!act) return;
    const scale = zoom / 100;
    if (act === "pan") {
      setCamera((prev) => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    } else if (act.type === "drag") {
      const dx = (e.clientX - act.startX) / scale;
      const dy = (e.clientY - act.startY) / scale;
      positionsRef.current[act.id] = {
        ...positionsRef.current[act.id],
        x: act.origX + dx, y: act.origY + dy,
      };
      forceRender();
    }
  }, [zoom]);

  const handlePointerUp = useCallback((e) => {
    const act = actionRef.current;
    if (act && act.type === "drag") {
      const pos = positionsRef.current[act.id];
      if (pos) onUpdateImage?.(act.id, pos);
    }
    setAction(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }, [onUpdateImage]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const imgEl = e.target.closest("[data-canvas-item]");
    if (!imgEl) return;
    const id = imgEl.dataset.canvasItem;
    const img = images.find((i) => i.id === id);
    if (!img) return;
    onSelectImage(img);
    setContextMenu({ x: e.clientX, y: e.clientY, img });
  }, [images, onSelectImage]);

  const handleContextAction = useCallback(async (actionId, img) => {
    switch (actionId) {
      case "copy":
        try {
          const res = await fetch(img.image_url);
          const blob = await res.blob();
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          toast("已复制到剪贴板", "success", 1500);
        } catch {
          try {
            await navigator.clipboard.writeText(img.image_url);
            toast("已复制链接", "success", 1500);
          } catch { toast("复制失败", "error", 1500); }
        }
        break;
      case "sendToChat":
        onSendToChat?.(img);
        break;
      case "export": {
        try {
          const res = await fetch(img.image_url);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `image-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast("已导出", "success", 1200);
        } catch { window.open(img.image_url, "_blank"); }
        break;
      }
      case "lock":
        if (lockedRef.current.has(img.id)) {
          lockedRef.current.delete(img.id);
          toast("已解锁", "info", 1200);
        } else {
          lockedRef.current.add(img.id);
          toast("已锁定", "info", 1200);
        }
        forceRender();
        break;
      case "delete":
        if (!lockedRef.current.has(img.id)) onDeleteImage?.(img.id);
        else toast("该图片已锁定", "error", 1500);
        break;
    }
  }, [onDeleteImage, onSendToChat, toast]);

  // External file drag-and-drop onto canvas
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setFileDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0 && onDropImages) {
      const scale = zoom / 100;
      const rect = containerRef.current?.getBoundingClientRect();
      const dropX = rect ? (e.clientX - rect.left - camera.x) / scale : 100;
      const dropY = rect ? (e.clientY - rect.top - camera.y) / scale : 100;
      onDropImages(files, dropX, dropY);
    }
  }, [onDropImages, zoom, camera]);

  const scale = zoom / 100;
  const isPanning = action === "pan";
  const isDragging = action?.type === "drag";

  const cursor = isHandTool
    ? (isPanning ? "cursor-grabbing" : "cursor-grab")
    : (isPanning ? "cursor-grabbing" : isDragging ? "cursor-move" : "cursor-default");

  return (
    <div
      ref={containerRef}
      className={`flex-1 relative overflow-hidden select-none ${cursor}`}
      style={{
        background: "var(--bg-primary)",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File drag overlay */}
      {fileDragOver && (
        <div className="absolute inset-0 z-30 bg-accent/10 border-2 border-dashed border-accent/50 flex items-center justify-center pointer-events-none">
          <div className="bg-bg-secondary/90 backdrop-blur-xl px-6 py-4 rounded-2xl border border-accent/30 shadow-2xl">
            <p className="text-sm text-accent font-medium">松手将图片添加到画布</p>
          </div>
        </div>
      )}

      {/* World layer */}
      <div
        className="absolute"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        {images.length === 0 && !fileDragOver && (
          <div
            className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
            style={{ left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${1 / scale})`, width: 300 }}
          >
            <div className="w-16 h-16 rounded-2xl bg-bg-secondary border border-border-primary flex items-center justify-center mb-4 opacity-30">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-tertiary">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </div>
            <p className="text-sm text-text-tertiary opacity-40">在右侧面板输入提示词开始生成</p>
            <p className="text-xs text-text-tertiary opacity-25 mt-1">拖拽平移 · 滚轮缩放 · 拖入图片 · 右键菜单</p>
          </div>
        )}

        {images.map((img) => {
          const pos = positionsRef.current[img.id];
          if (!pos) return null;
          const isSelected = selectedImage?.id === img.id;
          const isLocked = lockedRef.current.has(img.id);
          const meta = imageMetaRef.current[img.id];
          const displayHeight = meta
            ? Math.round((pos.w * meta.height) / meta.width)
            : Math.round(pos.w);

          return (
            <div
              key={img.id}
              data-canvas-item={img.id}
              className={`absolute group ${isLocked ? "opacity-90" : ""}`}
              style={{ left: pos.x, top: pos.y, width: pos.w }}
            >
              <div className={`rounded-xl overflow-hidden border-2 transition-colors ${
                isSelected ? "border-accent" : "border-transparent hover:border-border-secondary"
              }`}>
                <img
                  src={img.image_url}
                  alt={img.prompt}
                  className="w-full block pointer-events-none"
                  draggable={false}
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    if (naturalWidth && naturalHeight) {
                      imageMetaRef.current[img.id] = {
                        width: naturalWidth,
                        height: naturalHeight,
                      };
                      forceRender();
                    }
                  }}
                />

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); window.open(img.image_url, "_blank"); }}
                    className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-all" title="查看原图">
                    <Maximize2 size={14} />
                  </button>
                  <button onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); handleContextAction("export", img); }}
                    className="p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-all" title="下载">
                    <Download size={14} />
                  </button>
                  <button onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); if (!isLocked) onDeleteImage?.(img.id); }}
                    className={`p-1.5 rounded-lg bg-black/60 backdrop-blur-sm transition-all ${isLocked ? "text-zinc-600 cursor-not-allowed" : "text-red-400 hover:bg-red-500/80 hover:text-white"}`} title={isLocked ? "已锁定" : "删除"}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {isLocked && (
                  <div className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/60 text-amber-400 backdrop-blur-sm">
                    <Lock size={12} />
                  </div>
                )}
              </div>

              {isSelected && (
                <>
                  <div className="absolute -top-6 left-0 right-0 flex items-center justify-between text-[10px] text-accent pointer-events-none">
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-bg-primary/90 border border-accent/40">
                      <ImageIcon size={10} />
                      <span>{img.prompt || "Image"}</span>
                    </div>
                    <div className="px-1.5 py-0.5 rounded-md bg-bg-primary/90 border border-accent/40">
                      {Math.round(pos.w)} × {displayHeight}
                    </div>
                  </div>

                  <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-bg-primary border-2 border-accent rounded-[2px]" />
                  <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-bg-primary border-2 border-accent rounded-[2px]" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-bg-primary border-2 border-accent rounded-[2px]" />
                </>
              )}

              <p className="text-[10px] text-text-tertiary mt-1 truncate px-0.5 pointer-events-none">
                {img.prompt}
              </p>

              {isSelected && !isLocked && (
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-bg-primary rounded-[2px] cursor-nwse-resize border-2 border-accent"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startW = pos.w;
                    const onMove = (ev) => {
                      const dw = (ev.clientX - startX) / scale;
                      positionsRef.current[img.id] = { ...positionsRef.current[img.id], w: Math.max(120, startW + dw) };
                      forceRender();
                    };
                    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
                    window.addEventListener("pointermove", onMove);
                    window.addEventListener("pointerup", onUp);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Floating toolbar at bottom center */}
      <div data-toolbar>
        <Toolbar
          activeTool={activeTool}
          onToolChange={onToolChange}
          zoom={zoom}
          onZoomChange={onZoomChange}
        />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          img={contextMenu.img}
          isLocked={lockedRef.current.has(contextMenu.img.id)}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}
    </div>
  );
}
