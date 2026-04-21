"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles, ArrowRight, Wand2, Image as ImageIcon,
  Layers, Zap, Crown, Rocket, PenTool,
  Palette, RefreshCw, Download, MousePointer2, Sun, Moon,
} from "lucide-react";
import { useTheme } from "@/lib/useTheme";
import { compressImage } from "@/lib/imageUtils";
import BrandLogo from "@/components/BrandLogo";
import FloatingEntryWidget from "@/components/FloatingEntryWidget";

const FLOATING_DEFAULT_MODEL = "gemini-3.1-flash-image-preview-512";
const FLOATING_DEFAULT_SERVICE_TIER = "priority";
const FLOATING_AGENT_DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const FLOATING_AGENT_DEFAULT_SERVICE_TIER = "priority";
const FLOATING_HISTORY_STORAGE_KEY = "lovart-floating-entry-home-history";

function createFloatingMessage(role, text = "", extra = {}) {
  return {
    id: `floating-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    ...extra,
  };
}

function hasFloatingSessionContent({ prompt = "", refImages = [], attachments = [], messages = [] } = {}) {
  return Boolean(
    String(prompt || "").trim()
    || (Array.isArray(refImages) && refImages.length > 0)
    || (Array.isArray(attachments) && attachments.length > 0)
    || (Array.isArray(messages) && messages.length > 0)
  );
}

function buildFloatingHistoryTitle({ prompt = "", messages = [] } = {}) {
  const firstUserText = (Array.isArray(messages) ? messages : [])
    .find((item) => item?.role === "user" && String(item?.text || "").trim())?.text;
  const baseText = String(firstUserText || prompt || "").replace(/\s+/g, " ").trim();
  if (baseText) {
    return baseText.slice(0, 24);
  }
  return "未命名对话";
}

function createFloatingHistoryEntry({ prompt = "", refImages = [], attachments = [], messages = [] } = {}) {
  return {
    id: `floating-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: buildFloatingHistoryTitle({ prompt, messages }),
    updatedAt: Date.now(),
    prompt: String(prompt || ""),
    refImages: Array.isArray(refImages) ? refImages.slice(0, 6) : [],
    attachments: Array.isArray(attachments) ? attachments.slice(0, 8) : [],
    messages: Array.isArray(messages) ? messages.slice(-20) : [],
  };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function isTextLikeFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return (
    type.startsWith("text/")
    || type.includes("json")
    || type.includes("xml")
    || type.includes("javascript")
    || type.includes("typescript")
    || type.includes("markdown")
    || /\.(txt|md|markdown|csv|json|xml|html|htm|js|ts|jsx|tsx|css|scss|sass|less|rtf)$/i.test(name)
  );
}

function isServerExtractableFile(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return (
    type === "application/pdf"
    || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || /\.pdf$/i.test(name)
    || /\.docx$/i.test(name)
  );
}

function buildAttachmentSummary(file, textContent = "") {
  const excerpt = String(textContent || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  return {
    id: `attachment-${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    mimeType: file.type || "",
    size: file.size || 0,
    excerpt,
  };
}

async function extractDocumentAttachments(files) {
  if (!files.length) return [];

  const payload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      mimeType: file.type || "",
      size: file.size || 0,
      dataUrl: await readFileAsDataURL(file),
    }))
  );

  const res = await fetch("/api/floating-attachments/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: payload }),
  });
  const data = await parseApiResponse(res);
  if (!res.ok || data.error) {
    throw new Error(data.error || `附件解析失败（${res.status}）`);
  }
  return Array.isArray(data.data?.attachments) ? data.data.attachments : [];
}

async function parseApiResponse(res) {
  const rawText = await res.text();

  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return {
      error: `接口返回了非 JSON 内容：${rawText.slice(0, 120)}`,
    };
  }
}

function findClosestAspectRatio(width, height) {
  const candidates = [
    ["1:1", 1],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
    ["4:5", 4 / 5],
    ["5:4", 5 / 4],
    ["21:9", 21 / 9],
  ];

  const target = width / height;
  let best = candidates[0];
  let bestDiff = Math.abs(best[1] - target);
  for (const candidate of candidates.slice(1)) {
    const diff = Math.abs(candidate[1] - target);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best[0];
}

function inferAspectRatioFromPrompt(text) {
  if (!text || typeof text !== "string") return "1:1";
  const compact = text.toLowerCase().replace(/\s+/g, "");

  const explicitRatioMatch = compact.match(/(21|16|9|8|5|4|3|2|1)\s*[:：/xX]\s*(9|16|8|5|4|3|2|1)/);
  if (explicitRatioMatch) {
    return findClosestAspectRatio(Number(explicitRatioMatch[1]), Number(explicitRatioMatch[2]));
  }

  const explicitBiMatch = compact.match(/(21|16|9|8|5|4|3|2|1)\s*比\s*(9|16|8|5|4|3|2|1)/);
  if (explicitBiMatch) {
    return findClosestAspectRatio(Number(explicitBiMatch[1]), Number(explicitBiMatch[2]));
  }

  const dimensionMatch = compact.match(/(\d{3,5})\s*[xX*＊]\s*(\d{3,5})/);
  if (dimensionMatch) {
    return findClosestAspectRatio(Number(dimensionMatch[1]), Number(dimensionMatch[2]));
  }

  if (compact.includes("小红书") || compact.includes("笔记封面")) return "4:5";
  if (compact.includes("抖音") || compact.includes("快手") || compact.includes("竖屏")) return "9:16";
  if (compact.includes("公众号") || compact.includes("横版") || compact.includes("头图")) return "16:9";
  if (compact.includes("海报")) return "3:4";
  if (compact.includes("主图") || compact.includes("方图") || compact.includes("正方形")) return "1:1";

  return "1:1";
}

function detectRefImageMeta(dataUrl) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      resolve({
        ratio: width > 0 && height > 0 ? findClosestAspectRatio(width, height) : "1:1",
        width,
        height,
      });
    };
    img.onerror = () => resolve({ ratio: "1:1", width: 0, height: 0 });
    img.src = dataUrl;
  });
}

function buildAgentPrompt(text, refImages = []) {
  const basePrompt = String(text || "").trim();
  if (!refImages.length) {
    return basePrompt;
  }

  return `${basePrompt}

Agent mode hidden instructions:
- Treat the provided reference image(s) as the primary grounding.
- keep composition
- keep lighting
- keep aspect ratio
- keep camera angle, framing, perspective, and scene layout
- keep subject identity, key shapes, proportions, and object relationships
- do not crop, zoom, rotate, or rearrange the scene unless the user explicitly asks for it
- only change the parts that are explicitly requested by the user
- if multiple reference images are provided, use the first image as the main composition and aspect-ratio anchor`;
}

function resolveAgentParams(baseParams, promptText, refImages = []) {
  const compactText = String(promptText || "").replace(/\s+/g, "");
  const needsHighFidelity = /海报|poster|品牌|branding|logo|字体|排版|版式|产品图|电商|包装|KV|banner|高清|高细节|细节/.test(compactText);

  return {
    ...baseParams,
    model: needsHighFidelity ? "gemini-3-pro-image-preview" : FLOATING_AGENT_DEFAULT_MODEL,
    image_size: refImages.length > 0 ? "auto" : "1:1",
    num: 1,
    service_tier: FLOATING_AGENT_DEFAULT_SERVICE_TIER,
  };
}

function detectFloatingEntryMode(promptText, refImages = []) {
  if (Array.isArray(refImages) && refImages.length > 0) {
    return "agent";
  }

  const text = String(promptText || "").trim();
  if (!text) {
    return "quick";
  }

  const compact = text.toLowerCase().replace(/\s+/g, "");
  const agentSignals = [
    "海报", "poster", "品牌", "branding", "logo", "字体", "排版", "版式", "包装",
    "banner", "kv", "主视觉", "电商", "详情页", "详情图", "产品图", "广告",
    "营销", "视觉规范", "延展", "物料", "画册", "封面", "构图", "镜头", "景别",
    "光影", "材质", "质感", "高级感", "高细节", "高清", "风格统一",
  ];
  if (agentSignals.some((keyword) => compact.includes(keyword))) {
    return "agent";
  }

  const structuredPrompt =
    text.length >= 48 ||
    /[，。；：\n]/.test(text) ||
    /(保持|保留|突出|强调|避免|不要|并且|同时|需要|要求)/.test(text);

  return structuredPrompt ? "agent" : "quick";
}

function getLatestGeneratedImages(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && Array.isArray(message.images) && message.images.length > 0) {
      return message.images.filter((src) => typeof src === "string" && src);
    }
  }
  return [];
}

function shouldReusePreviousGeneratedImages(promptText, explicitRefImages = []) {
  if (Array.isArray(explicitRefImages) && explicitRefImages.length > 0) {
    return false;
  }

  const text = String(promptText || "").trim().toLowerCase();
  if (!text) {
    return false;
  }

  const editOrGenerateIntent =
    /(换|改|继续|再来|重做|延续|保留|参考|基于|按照|照着|生成|出图|做一版|来一版|来一组|另一套|不同的|同风格|同款|变成)/.test(text);
  const contextualTarget =
    /(这张|这个|这套|上一张|上一个|刚才|前面|之前|上次)/.test(text);
  const shortFollowup =
    /(再来一版|再来一个|换一组|换一版|继续改|继续做|换个配色|换个服装|再换套)/.test(text);

  return shortFollowup || (editOrGenerateIntent && contextualTarget) || /参考这个/.test(text);
}

function isObviousFloatingGenerateRequest(promptText, refImages = [], attachments = []) {
  const text = String(promptText || "").trim().toLowerCase();
  if (!text) return false;

  if (Array.isArray(attachments) && attachments.length > 0) {
    return false;
  }

  const explicitQuestionIntent =
    /(是什么|为什么|怎么|如何|分析|总结|解释|提取|读取|新闻|资讯|内容|文案|正文|描述|介绍|建议|推荐|帮我看看)/.test(text);

  const directGenerateIntent =
    /(生成|生图|出图|画一张|画个|绘制|渲染|做一张|做个|做一版|来一张|来一版|给我一张|创建一张|设计一张)/.test(text);

  const directEditIntent =
    /(改成|变成|换成|换一版|换一组|继续改|继续做|重做|延展|参考这个|照着这个|按照这个|其它保持不变)/.test(text);

  if (Array.isArray(refImages) && refImages.length > 0) {
    return directEditIntent || directGenerateIntent;
  }

  return directGenerateIntent && !explicitQuestionIntent;
}

const FEATURES = [
  { icon: Wand2, title: "AI 智能生图", desc: "输入文字描述，AI 为你生成高质量图片", iconColor: "text-violet-400" },
  { icon: Layers, title: "多图参考编辑", desc: "上传参考图进行风格迁移、材质替换等操作", iconColor: "text-blue-400" },
  { icon: PenTool, title: "交互式画布", desc: "自由拖拽、缩放、排列你的创作素材", iconColor: "text-emerald-400" },
  { icon: Palette, title: "多种模型选择", desc: "从极速到专业级，按需选择生成质量与速度", iconColor: "text-amber-400" },
  { icon: RefreshCw, title: "撤销 / 重做", desc: "完整的编辑历史，随时回退任意步骤", iconColor: "text-rose-400" },
  { icon: Download, title: "导出分享", desc: "一键导出画布或单张图片，支持复制到剪贴板", iconColor: "text-sky-400" },
];

const MODELS = [
  { icon: Zap, name: "Nano Banana", desc: "极速低价 · 适合快速出图", color: "text-green-400" },
  { icon: Rocket, name: "Nano Banana 2", desc: "推荐 · 高性价比 · 最高4K", color: "text-blue-400" },
  { icon: Crown, name: "Nano Banana Pro", desc: "专业画质 · Thinking · 最高4K", color: "text-amber-400" },
];

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [navVisible, setNavVisible] = useState(false);
  const [floatingPrompt, setFloatingPrompt] = useState("");
  const [floatingRefImages, setFloatingRefImages] = useState([]);
  const [floatingAttachments, setFloatingAttachments] = useState([]);
  const [floatingIsGenerating, setFloatingIsGenerating] = useState(false);
  const [floatingOutputError, setFloatingOutputError] = useState("");
  const [floatingMessages, setFloatingMessages] = useState([]);
  const [floatingHistory, setFloatingHistory] = useState([]);
  const [floatingRuntimeMode, setFloatingRuntimeMode] = useState("quick");
  const { theme, toggleTheme } = useTheme("dark");
  const floatingEntryMode = floatingIsGenerating
    ? floatingRuntimeMode
    : detectFloatingEntryMode(floatingPrompt, floatingRefImages);
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FLOATING_HISTORY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFloatingHistory(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        FLOATING_HISTORY_STORAGE_KEY,
        JSON.stringify(floatingHistory.slice(0, 12))
      );
    } catch {}
  }, [floatingHistory]);

  const resetFloatingConversation = () => {
    setFloatingPrompt("");
    setFloatingRefImages([]);
    setFloatingAttachments([]);
    setFloatingMessages([]);
    setFloatingOutputError("");
    setFloatingRuntimeMode("quick");
  };

  const archiveFloatingConversation = () => {
    const snapshot = {
      prompt: floatingPrompt,
      refImages: floatingRefImages,
      attachments: floatingAttachments,
      messages: floatingMessages,
    };
    if (!hasFloatingSessionContent(snapshot)) {
      return false;
    }
    setFloatingHistory((prev) => [createFloatingHistoryEntry(snapshot), ...prev].slice(0, 12));
    return true;
  };

  const handleFloatingNewChat = () => {
    if (floatingIsGenerating) return;
    archiveFloatingConversation();
    resetFloatingConversation();
  };

  const handleSelectFloatingHistory = (historyId) => {
    if (floatingIsGenerating) return;
    const item = floatingHistory.find((entry) => entry.id === historyId);
    if (!item) return;
    setFloatingPrompt(String(item.prompt || ""));
    setFloatingRefImages(Array.isArray(item.refImages) ? item.refImages : []);
    setFloatingAttachments(Array.isArray(item.attachments) ? item.attachments : []);
    setFloatingMessages(Array.isArray(item.messages) ? item.messages : []);
    setFloatingOutputError("");
    setFloatingRuntimeMode("quick");
  };

  const handleDeleteFloatingHistory = (historyId) => {
    if (floatingIsGenerating) return;
    setFloatingHistory((prev) => prev.filter((entry) => entry.id !== historyId));
  };

  const handleFloatingFilesAdd = async (files) => {
    const imageFiles = files.filter((file) => file.type?.startsWith("image/"));
    const otherFiles = files.filter((file) => !file.type?.startsWith("image/"));

    if (imageFiles.length) {
      const rawDataUrls = await Promise.all(imageFiles.map((file) => readFileAsDataURL(file)));
      const compressed = await Promise.all(
        rawDataUrls.map(async (dataUrl) => {
          try {
            return await compressImage(dataUrl, 1280, 0.78);
          } catch {
            return dataUrl;
          }
        })
      );
      setFloatingRefImages((prev) => [...prev, ...compressed]);
    }

    if (otherFiles.length) {
      const textFiles = otherFiles.filter((file) => isTextLikeFile(file));
      const extractableFiles = otherFiles.filter((file) => !isTextLikeFile(file) && isServerExtractableFile(file));
      const passthroughFiles = otherFiles.filter((file) => !isTextLikeFile(file) && !isServerExtractableFile(file));

      const textSummaries = await Promise.all(
        textFiles.map(async (file) => {
          let textContent = "";
          try {
            textContent = await readFileAsText(file);
          } catch {}
          return buildAttachmentSummary(file, textContent);
        })
      );

      let extractedSummaries = [];
      if (extractableFiles.length) {
        try {
          extractedSummaries = await extractDocumentAttachments(extractableFiles);
        } catch {
          extractedSummaries = extractableFiles.map((file) => buildAttachmentSummary(file));
        }
      }

      const passthroughSummaries = passthroughFiles.map((file) => buildAttachmentSummary(file));
      const summaries = [...textSummaries, ...extractedSummaries, ...passthroughSummaries];
      setFloatingAttachments((prev) => [...prev, ...summaries]);
    }
  };

  const handleFloatingImageRemove = (indexToRemove) => {
    setFloatingRefImages((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleFloatingAttachmentRemove = (attachmentId) => {
    setFloatingAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  };

  const handleFloatingSubmit = async () => {
    const prompt = String(floatingPrompt || "").trim();
    if (!prompt && floatingRefImages.length === 0) return;

    const inheritedImages = shouldReusePreviousGeneratedImages(prompt, floatingRefImages)
      ? getLatestGeneratedImages(floatingMessages)
      : [];
    const submittedImages = [...floatingRefImages, ...inheritedImages];
    const submittedAttachments = [...floatingAttachments];
    const predictedMode = detectFloatingEntryMode(prompt, submittedImages);
    const bypassPlannerForDirectGenerate = isObviousFloatingGenerateRequest(
      prompt,
      submittedImages,
      submittedAttachments
    );
    const nextUserMessage = createFloatingMessage("user", prompt, {
      refImages: submittedImages,
      attachments: submittedAttachments,
    });
    const historyForAssistant = [...floatingMessages, nextUserMessage].map((message) => ({
      role: message.role,
      text: message.text || "",
      images: Array.isArray(message.images) ? message.images.slice(0, 3) : [],
      refImages: Array.isArray(message.refImages) ? message.refImages.slice(0, 3) : [],
      attachments: Array.isArray(message.attachments) ? message.attachments.slice(0, 4) : [],
    }));

    setFloatingMessages((prev) => [...prev, nextUserMessage]);
    setFloatingPrompt("");
    setFloatingRefImages([]);
    setFloatingAttachments([]);
    setFloatingRuntimeMode(predictedMode);
    setFloatingIsGenerating(true);
    setFloatingOutputError("");

    try {
      const plan = bypassPlannerForDirectGenerate
        ? {
            action: "generate",
            mode: predictedMode,
            assistantText: submittedImages.length > 0
              ? "我直接按你的要求开始改图。"
              : "我直接按你的要求开始生图。",
            assistantModel: "直连 Nano",
          }
        : await (async () => {
            const plannerRes = await fetch("/api/floating-assistant", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: historyForAssistant,
                currentInput: prompt,
                refImages: submittedImages,
                attachments: submittedAttachments,
              }),
            });
            const plannerData = await parseApiResponse(plannerRes);
            if (!plannerRes.ok || plannerData.error) {
              throw new Error(plannerData.error || `对话判断失败（${plannerRes.status}）`);
            }
            return plannerData.data || {};
          })();
      const resolvedMode = plan.mode === "agent" ? "agent" : "quick";
      const assistantText = String(plan.assistantText || "").trim();
      setFloatingRuntimeMode(resolvedMode);

      if (plan.action === "reply") {
        setFloatingMessages((prev) => [
          ...prev,
          createFloatingMessage("assistant", assistantText || "我先给你一些建议，你也可以继续补充需求。", {
            modelLabel: plan.assistantModel || "gpt-5.4",
          }),
        ]);
        return;
      }

      const hasImages = submittedImages.length > 0;
      const isAgentMode = resolvedMode === "agent";
      const generationPrompt = prompt;
      const firstRefMeta = hasImages ? await detectRefImageMeta(submittedImages[0]) : null;
      const quickImageSize = hasImages
        ? (firstRefMeta?.ratio || "1:1")
        : inferAspectRatioFromPrompt(generationPrompt);
      const agentParams = resolveAgentParams(
        {
          model: FLOATING_AGENT_DEFAULT_MODEL,
          image_size: "1:1",
          num: 1,
          service_tier: FLOATING_AGENT_DEFAULT_SERVICE_TIER,
        },
        generationPrompt,
        submittedImages
      );
      const imageSize = isAgentMode
        ? (agentParams.image_size === "auto" ? (firstRefMeta?.ratio || "1:1") : agentParams.image_size)
        : quickImageSize;
      const endpoint = hasImages ? "/api/edit" : "/api/generate";
      const finalPrompt = isAgentMode ? buildAgentPrompt(generationPrompt, submittedImages) : generationPrompt;
      const payload = hasImages
        ? {
            prompt: finalPrompt,
            image: submittedImages.length === 1 ? submittedImages[0] : submittedImages,
            model: isAgentMode ? agentParams.model : FLOATING_DEFAULT_MODEL,
            image_size: imageSize,
            num: 1,
            service_tier: isAgentMode ? agentParams.service_tier : FLOATING_DEFAULT_SERVICE_TIER,
          }
        : {
            prompt: finalPrompt,
            model: isAgentMode ? agentParams.model : FLOATING_DEFAULT_MODEL,
            image_size: imageSize,
            num: 1,
            ref_images: submittedImages,
            service_tier: isAgentMode ? agentParams.service_tier : FLOATING_DEFAULT_SERVICE_TIER,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse(res);
      if (!res.ok || data.error) {
        throw new Error(data.error || `生成失败（${res.status}）`);
      }

      const urls = Array.isArray(data.data?.urls) ? data.data.urls.filter(Boolean) : [];
      if (urls.length === 0) {
        throw new Error("未返回结果图片");
      }

      setFloatingMessages((prev) => [
        ...prev,
        createFloatingMessage(
          "assistant",
          assistantText || (resolvedMode === "agent" ? "我已经按你的要求整理并生成了一版结果。" : "我已经帮你快速生成了一版结果。"),
          {
            images: urls,
            modelLabel: `${plan.assistantModel || "gpt-5.4"} · ${isAgentMode ? agentParams.model : FLOATING_DEFAULT_MODEL}`,
          }
        ),
      ]);
    } catch (err) {
      setFloatingMessages((prev) => [
        ...prev,
        createFloatingMessage("assistant", err?.message || "处理失败，请稍后重试。"),
      ]);
      setFloatingOutputError("");
    } finally {
      setFloatingIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary overflow-x-hidden overflow-y-auto">
      <div
        className="fixed top-0 left-0 right-0 z-40 h-6"
        onMouseEnter={() => setNavVisible(true)}
      />
      {/* Nav */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 lg:px-12 py-4 bg-bg-primary/70 backdrop-blur-xl border-b border-border-primary/60 transition-all duration-200 ${
          navVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
        }`}
        onMouseEnter={() => setNavVisible(true)}
        onMouseLeave={() => setNavVisible(false)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center">
            <BrandLogo className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-semibold text-text-primary tracking-tight">Easy AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all flex items-center justify-center"
            title={theme === "dark" ? "切换到浅色" : "切换到深色"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link
            href="/canvas"
            className="h-9 px-5 rounded-xl bg-bg-secondary text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all flex items-center gap-2"
          >
            进入工作台
            <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* Hero with video */}
      <section className="relative w-full h-screen min-h-[600px] overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          src="/videos/hero.mp4"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary/38 via-bg-primary/14 to-transparent" />

        <div className={`absolute inset-0 flex flex-col items-center justify-end pb-24 lg:pb-32 px-6 text-center transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h1 className="text-4xl lg:text-6xl font-bold text-text-primary leading-tight tracking-tight mb-5">
            用 <span style={{ color: "#3FCA58" }}>AI</span> 释放
            <br />你的创意想象力
          </h1>
          <p className="text-base lg:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed mb-10">
            输入文字描述，AI 即刻生成高质量图片。支持多图参考、风格迁移、材质替换，在交互式画布上自由编排你的创作。
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/canvas"
              className="h-12 px-8 rounded-full bg-white text-black font-medium flex items-center gap-2.5 transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98]"
            >
              <MousePointer2 size={18} />
              开始创作
            </Link>
            <a
              href="#features"
              className="h-12 px-8 rounded-full bg-bg-secondary/80 text-text-secondary hover:text-text-primary hover:bg-bg-hover font-medium flex items-center gap-2 transition-all"
            >
              了解更多
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className={`relative z-10 px-6 lg:px-12 max-w-5xl mx-auto pt-24 pb-20 transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="text-center mb-14">
          <h2 className="text-2xl lg:text-3xl font-bold text-text-primary mb-3">强大功能</h2>
          <p className="text-sm text-text-secondary">从生成到编辑，一站式 AI 创作体验</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="rounded-2xl bg-bg-secondary p-6 hover:bg-bg-hover transition-all duration-300 ease-out hover:scale-[1.04] hover:shadow-lg hover:shadow-black/20 origin-center will-change-transform"
              >
                <div className={`w-10 h-10 rounded-xl bg-bg-tertiary flex items-center justify-center mb-4 ${f.iconColor}`}>
                  <Icon size={20} />
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{f.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Models */}
      <section className={`relative z-10 px-6 lg:px-12 max-w-5xl mx-auto pb-24 transition-all duration-700 delay-400 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="text-center mb-14">
          <h2 className="text-2xl lg:text-3xl font-bold text-text-primary mb-3">模型选择</h2>
          <p className="text-sm text-text-secondary">三档算力，灵活匹配你的创作需求</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {MODELS.map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={i}
                className="rounded-2xl bg-bg-secondary p-8 text-center hover:bg-bg-hover transition-all duration-300 ease-out hover:scale-[1.04] hover:shadow-lg hover:shadow-black/20 origin-center will-change-transform"
              >
                <div className={`w-14 h-14 rounded-2xl bg-bg-tertiary flex items-center justify-center mx-auto mb-5 ${m.color}`}>
                  <Icon size={26} />
                </div>
                <h3 className="text-base font-semibold text-text-primary mb-2">{m.name}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{m.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className={`relative z-10 px-6 lg:px-12 max-w-5xl mx-auto pb-20 transition-all duration-700 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="rounded-3xl bg-bg-secondary p-12 lg:p-16 text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-text-primary mb-4">准备好开始了吗？</h2>
          <p className="text-sm text-text-secondary mb-8 max-w-lg mx-auto">
            无需注册，打开画布即刻开始 AI 创作
          </p>
          <Link
            href="/canvas"
            className="inline-flex items-center gap-2.5 h-12 px-8 rounded-2xl bg-white text-black font-medium transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles size={18} />
            立即开始
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-primary px-6 lg:px-12 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center">
              <BrandLogo className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs text-text-tertiary">Easy AI</span>
          </div>
          <span className="text-xs text-text-tertiary">Powered by Nano Banana API</span>
        </div>
      </footer>

      <FloatingEntryWidget
        storageKey="lovart-floating-entry-home-position"
        prompt={floatingPrompt}
        onPromptChange={setFloatingPrompt}
        onFilesAdd={handleFloatingFilesAdd}
        onPreviewImageRemove={handleFloatingImageRemove}
        onAttachmentRemove={handleFloatingAttachmentRemove}
        onSubmit={handleFloatingSubmit}
        canSubmit={Boolean(String(floatingPrompt || "").trim())}
        isSubmitting={floatingIsGenerating}
        entryMode={floatingEntryMode}
        messages={floatingMessages}
        historyItems={floatingHistory}
        previewImages={floatingRefImages}
        attachmentItems={floatingAttachments}
        onNewChat={handleFloatingNewChat}
        onSelectHistory={handleSelectFloatingHistory}
        onDeleteHistory={handleDeleteFloatingHistory}
        outputError={floatingOutputError}
        outputIdleText={
          floatingEntryMode === "agent"
            ? "你可以直接提需求、问建议，或让它帮你生成图片。"
            : "一句话说出想法，它会自动判断是给建议还是直接出图。"
        }
        submitLabel="去生成"
      />
    </div>
  );
}
