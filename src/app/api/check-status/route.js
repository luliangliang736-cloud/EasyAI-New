import { NextResponse } from "next/server";

export const maxDuration = 30;

const API_BASE = process.env.NANO_API_BASE || "https://gateway.bananapro.site";
const API_KEY = process.env.NANO_API_KEY;

export async function POST(request) {
  if (!API_KEY || API_KEY === "sk-your-api-key-here") {
    return NextResponse.json(
      { error: "API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { task_id } = await request.json();

    if (!task_id) {
      return NextResponse.json(
        { error: "task_id is required" },
        { status: 400 }
      );
    }

    console.log("[CheckStatus] Checking task:", task_id);

    const res = await fetch(`${API_BASE}/api/v1/images/check-status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ task_id }),
    });

    const rawText = await res.text();
    console.log("[CheckStatus] Response status:", res.status, "body:", rawText.slice(0, 500));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: `API returned non-JSON response (${res.status}): ${rawText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || data.error || `Status check failed (${res.status})` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[CheckStatus] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
