import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_EXCERPT_LENGTH = 3000;

function toBufferFromDataUrl(dataUrl = "") {
  const match = String(dataUrl).match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    throw new Error("附件内容格式无效");
  }
  return Buffer.from(match[1], "base64");
}

function normalizeText(text = "") {
  return String(text)
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, MAX_EXCERPT_LENGTH);
}

function buildAttachmentSummary(file = {}, excerpt = "") {
  return {
    id: `attachment-${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(file.name || "未命名文件"),
    mimeType: String(file.mimeType || ""),
    size: Number(file.size || 0),
    excerpt: normalizeText(excerpt),
  };
}

async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result?.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result?.value || "";
}

async function extractTextFromFile(file = {}) {
  const fileName = String(file.name || "").toLowerCase();
  const mimeType = String(file.mimeType || "").toLowerCase();
  const buffer = toBufferFromDataUrl(file.dataUrl);

  if (buffer.length > MAX_FILE_SIZE) {
    return "";
  }

  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || fileName.endsWith(".docx")
  ) {
    return extractDocxText(buffer);
  }

  return "";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files.slice(0, 6) : [];

    const attachments = await Promise.all(
      files.map(async (file) => {
        try {
          const excerpt = await extractTextFromFile(file);
          return buildAttachmentSummary(file, excerpt);
        } catch {
          return buildAttachmentSummary(file);
        }
      })
    );

    return NextResponse.json({
      ok: true,
      data: {
        attachments,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "附件提取失败",
      },
      { status: 500 }
    );
  }
}
