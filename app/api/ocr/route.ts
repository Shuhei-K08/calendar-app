import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatJst, nextPacificMidnight } from "@/lib/quotaReset";

// Google Gemini（Google AI Studio）の無料枠を使った画像OCR。
// 必要な環境変数:
//   GEMINI_API_KEY   … https://aistudio.google.com/apikey で取得（無料）
//   GEMINI_MODEL     … 任意。既定は gemini-2.5-flash（画像+テキスト対応・無料枠あり）
// ※ gemini-2.0-flash は 2026-06-01 に終了済みのため使わないこと。

const OCR_PROMPT =
  "この画像に書かれている文字を読み取り、メモとして読みやすい形に整えて出力してください。" +
  "ルール:\n" +
  "- 書かれている情報は省略・要約・変更せず、すべて残す（金額・日時・電話番号・固有名詞などは正確に）。\n" +
  "- 画像の横幅による不自然な途中改行はつなげ、文章として自然に読めるようにする。\n" +
  "- 「※」などの項目・箇条書き、日付/時刻/連絡先などのまとまりは、項目ごとに改行して整理する。\n" +
  "- 前置き・説明・感想・補足コメントは一切付けず、整えた本文のみを返す。\n" +
  "- 文字が無い場合は空文字を返す。";

// 画像の public URL から user_id を推定する。
// 形式: https://<proj>.supabase.co/storage/v1/object/public/event-images/<user_id>/<file>
const extractUserId = (imageUrl: string): string | null => {
  const match = imageUrl.match(/\/event-images\/([0-9a-f-]{36})\//i);
  return match ? match[1] : null;
};

type UsageStatus = "success" | "limit" | "error";

const logOcrUsage = async (params: {
  imageUrl: string;
  status: UsageStatus;
  promptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}) => {
  try {
    const admin = createSupabaseAdmin();
    if (!admin) return; // service role 未設定なら記録しない（OCRは続行）
    await admin.from("ocr_usage").insert({
      user_id: extractUserId(params.imageUrl),
      status: params.status,
      prompt_tokens: params.promptTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      total_tokens: params.totalTokens ?? 0,
    });
  } catch (error) {
    // 記録の失敗はOCR本体に影響させない
    console.error("ocr_usage log failed", error);
  }
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が未設定です。.env.local に追加してください。" },
      { status: 500 },
    );
  }

  let imageUrl: string | undefined;
  try {
    const body = (await request.json()) as { imageUrl?: string };
    imageUrl = body.imageUrl;
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try {
    // 1) 画像を取得して base64 へ
    const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imageRes.ok) {
      return NextResponse.json({ error: "画像の取得に失敗しました" }, { status: 502 });
    }
    const mimeType = imageRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    const arrayBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // 2) Gemini に問い合わせ
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: OCR_PROMPT },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => "");
      console.error("Gemini OCR error", geminiRes.status, detail);

      let message: string;
      if (geminiRes.status === 429) {
        const resetAt = formatJst(nextPacificMidnight());
        message = `AI読み取りの上限に達しました。${resetAt}頃にリセットされます。`;
        await logOcrUsage({ imageUrl, status: "limit" });
      } else if (geminiRes.status === 400 || geminiRes.status === 403) {
        message = "APIキーが無効か、権限がありません。設定を確認してください。";
        await logOcrUsage({ imageUrl, status: "error" });
      } else {
        message = `AI読み取りに失敗しました (${geminiRes.status})`;
        await logOcrUsage({ imageUrl, status: "error" });
      }

      return NextResponse.json(
        { error: message },
        { status: geminiRes.status === 429 ? 429 : 502 },
      );
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

    await logOcrUsage({
      imageUrl,
      status: "success",
      promptTokens: data.usageMetadata?.promptTokenCount,
      outputTokens: data.usageMetadata?.candidatesTokenCount,
      totalTokens: data.usageMetadata?.totalTokenCount,
    });

    return NextResponse.json({ text });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "OCR処理中にエラーが発生しました" }, { status: 500 });
  }
}
