"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import TopBar from "@/components/TopBar";
import Canvas from "@/components/Canvas";
import ChatPanel from "@/components/ChatPanel";
import HistoryPanel from "@/components/HistoryPanel";
import { ToastProvider, useToast } from "@/components/Toast";
import { compressImage } from "@/lib/imageUtils";
import { useHistory } from "@/lib/useHistory";

function errStr(e) {
  if (!e) return "未知错误";
  if (typeof e === "string") return e;
  return e.message || e.error || JSON.stringify(e);
}

const MODEL_LABELS = {
  "gemini-2.5-flash-image": "Nano Banana 1K",
  "gemini-2.5-flash-image-hd": "Nano Banana 1K HD",
  "gemini-3.1-flash-image-preview-512": "Nano Banana 2 512px",
  "gemini-3.1-flash-image-preview": "Nano Banana 2 1K",
  "gemini-3.1-flash-image-preview-2k": "Nano Banana 2 2K",
  "gemini-3.1-flash-image-preview-4k": "Nano Banana 2 4K",
  "gemini-3-pro-image-preview": "Pro 1K",
  "gemini-3-pro-image-preview-2k": "Pro 2K",
  "gemini-3-pro-image-preview-4k": "Pro 4K",
};

function HomeInner() {
  const toast = useToast();
  const [activeTool, setActiveTool] = useState("select");
  const [zoom, setZoom] = useState(100);
  const [prompt, setPrompt] = useState("");
  const [refImages, setRefImages] = useState([]);
  const [params, setParams] = useState({
    model: "gemini-3.1-flash-image-preview",
    image_size: "1:1",
    num: 1,
  });
  const [showParams, setShowParams] = useState(false);
  const [messages, setMessages] = useState([]);
  const canvasHistory = useHistory([]);
  const canvasImages = canvasHistory.state;
  const [selectedImage, setSelectedImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [panelWidth, setPanelWidth] = useState(340);
  const canvasRef = useRef(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const ver = localStorage.getItem("lovart-version");
      if (ver !== "7") {
        localStorage.removeItem("lovart-messages");
        localStorage.removeItem("lovart-canvas-images");
        localStorage.setItem("lovart-version", "7");
        return;
      }
      const saved = localStorage.getItem("lovart-messages");
      const savedImages = localStorage.getItem("lovart-canvas-images");
      if (saved) setMessages(JSON.parse(saved));
      if (savedImages) canvasHistory.setState(JSON.parse(savedImages));
    } catch {
      localStorage.removeItem("lovart-messages");
      localStorage.removeItem("lovart-canvas-images");
    }
  }, []);

  // Persist messages
  useEffect(() => {
    localStorage.setItem("lovart-messages", JSON.stringify(messages.slice(0, 200)));
  }, [messages]);

  // Persist canvas images
  useEffect(() => {
    localStorage.setItem("lovart-canvas-images", JSON.stringify(canvasImages.slice(0, 100)));
  }, [canvasImages]);

  // Undo / Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (!["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
          e.preventDefault();
          canvasHistory.undo();
          toast("撤销成功", "info", 1200);
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        if (!["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
          e.preventDefault();
          canvasHistory.redo();
          toast("重做成功", "info", 1200);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canvasHistory, toast]);

  const updateMessage = useCallback((id, updates) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const handleGenerate = useCallback(async () => {
    const text = prompt.trim();
    if (!text || isGenerating) return;

    const ts = Date.now();
    const userMsgId = "user-" + ts;
    const aiMsgId = "ai-" + ts;
    const modelLabel = MODEL_LABELS[params.model] || params.model;
    const hasImages = refImages.length > 0;

    const userMsg = {
      id: userMsgId, role: "user", text,
      params: { ...params }, modelLabel,
      refImages: hasImages ? [...refImages] : [],
    };
    const aiMsg = {
      id: aiMsgId, role: "assistant", text,
      params: { ...params }, modelLabel,
      status: "generating", urls: [], error: null,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setIsGenerating(true);
    setPrompt("");

    try {
      const compressed = await Promise.all(
        refImages.map((img) => compressImage(img, 1024, 0.8))
      );

      const imageSize = params.image_size === "auto"
        ? (params._autoRatio || "1:1")
        : params.image_size;

      let res;
      if (hasImages) {
        const image = compressed.length === 1 ? compressed[0] : compressed;
        res = await fetch("/api/edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text, image,
            model: params.model, image_size: imageSize, num: params.num,
          }),
        });
      } else {
        res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            model: params.model, image_size: imageSize, num: params.num,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok || data.error) {
        updateMessage(aiMsgId, { status: "failed", error: errStr(data.error) });
        setIsGenerating(false);
        return;
      }

      const urls = data.data?.urls || [];
      if (urls.length > 0) {
        updateMessage(aiMsgId, { status: "completed", urls });
        const newCanvasImages = urls.map((url, i) => ({
          id: aiMsgId + "-" + i, image_url: url, prompt: text,
        }));
        canvasHistory.push((prev) => [...prev, ...newCanvasImages]);
        toast(`生成完成，${urls.length} 张图片已添加到画布`, "success");
      } else {
        updateMessage(aiMsgId, { status: "failed", error: "未返回图片" });
      }

      setRefImages([]);
    } catch (err) {
      updateMessage(aiMsgId, { status: "failed", error: "请求失败: " + errStr(err) });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, params, refImages, isGenerating, updateMessage, canvasHistory, toast]);

  const handleDeleteImage = useCallback((id) => {
    canvasHistory.push((prev) => prev.filter((img) => img.id !== id));
    setSelectedImage((prev) => (prev?.id === id ? null : prev));
    toast("已删除", "info", 1200);
  }, [canvasHistory, toast]);

  const handleSendToChat = useCallback((img) => {
    if (img?.image_url) {
      setRefImages((prev) => [...prev, img.image_url]);
      toast("已发送到对话", "success", 1500);
    }
  }, [toast]);

  const handleUpdateImage = useCallback(() => {}, []);

  // When selecting/deselecting a canvas image, sync it as a ref image in chat
  const canvasSelectionRef = useRef(null);
  const handleSelectImage = useCallback((img) => {
    // Remove previous canvas-selected image from refImages
    if (canvasSelectionRef.current) {
      const prevUrl = canvasSelectionRef.current;
      setRefImages((prev) => prev.filter((u) => u !== prevUrl));
    }
    setSelectedImage(img);
    if (img?.image_url) {
      canvasSelectionRef.current = img.image_url;
      setRefImages((prev) => [...prev, img.image_url]);
    } else {
      canvasSelectionRef.current = null;
    }
  }, []);

  const handleZoomChange = useCallback((updater) => {
    setZoom((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  // Drop image files onto canvas → convert to data URL → add as canvas items
  const handleDropImages = useCallback((files, dropX, dropY) => {
    files.forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const id = `drop-${Date.now()}-${i}`;
        const newImg = { id, image_url: dataUrl, prompt: file.name };
        canvasHistory.push((prev) => [...prev, newImg]);
      };
      reader.readAsDataURL(file);
    });
    toast(`已添加 ${files.length} 张图片到画布`, "success");
  }, [canvasHistory, toast]);

  const handleRetry = useCallback((msg) => {
    setPrompt(msg.text);
    if (msg.params) setParams(msg.params);
  }, []);

  const handleDownload = useCallback(async (msg) => {
    const url = msg.image_url;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `image-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast("已下载", "success", 1200);
    } catch {
      window.open(url, "_blank");
    }
  }, [toast]);

  const handleImageClick = useCallback((msg) => {
    setSelectedImage(msg);
  }, []);

  const handleExport = useCallback(() => {
    if (canvasRef.current?.exportCanvas) {
      canvasRef.current.exportCanvas();
    } else if (selectedImage?.image_url) {
      handleDownload(selectedImage);
    }
  }, [selectedImage, handleDownload]);

  const handleUndo = useCallback(() => {
    canvasHistory.undo();
    toast("撤销", "info", 1200);
  }, [canvasHistory, toast]);

  const handleRedo = useCallback(() => {
    canvasHistory.redo();
    toast("重做", "info", 1200);
  }, [canvasHistory, toast]);

  // History panel: click an item → fill prompt with that text
  const handleSelectHistory = useCallback((msg) => {
    if (msg.text) setPrompt(msg.text);
    if (msg.params) setParams(msg.params);
    toast("已载入历史提示词", "info", 1200);
  }, [toast]);

  const handleClearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem("lovart-messages");
    toast("历史记录已清空", "info", 1500);
  }, [toast]);

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        projectName="Easy AI"
        onExport={handleExport}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canvasHistory.canUndo}
        canRedo={canvasHistory.canRedo}
      />
      <div className="flex-1 flex overflow-hidden">
        <HistoryPanel
          messages={messages}
          onSelectHistory={handleSelectHistory}
          onClearHistory={handleClearHistory}
        />
        <Canvas
          ref={canvasRef}
          images={canvasImages}
          selectedImage={selectedImage}
          onSelectImage={handleSelectImage}
          onDeleteImage={handleDeleteImage}
          onUpdateImage={handleUpdateImage}
          onSendToChat={handleSendToChat}
          onDropImages={handleDropImages}
          activeTool={activeTool}
          onToolChange={setActiveTool}
          zoom={zoom}
          onZoomChange={handleZoomChange}
        />
        <ChatPanel
          messages={messages}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleGenerate}
          isGenerating={isGenerating}
          params={params}
          onParamsChange={setParams}
          showParams={showParams}
          onToggleParams={() => setShowParams(!showParams)}
          refImages={refImages}
          onRefImagesChange={setRefImages}
          onRetry={handleRetry}
          onDownload={handleDownload}
          onImageClick={handleImageClick}
          width={panelWidth}
          onWidthChange={setPanelWidth}
        />
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ToastProvider>
      <HomeInner />
    </ToastProvider>
  );
}
