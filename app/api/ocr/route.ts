import { NextResponse } from "next/server";

// Google Gemini（Google AI Studio）の無料枠を使った画像OCR。
// 必要な環境変数:
//   GEMINI_API_KEY   … https://aistudio.google.com/apikey で取得（無料）
//   GEMINI_MODEL     … 任意。既定は gemini-2.5-flash（画像+テキスト対応・無料枠あり）
// ※ gemini-2.0-flash は 2026-06-01 に終了済みのため使わないこと。

const OCR_PROMPT =
  "この画像に書かれている文字をすべて、原文のまま正確に抽出してください。" +
  "前置き・説明・要約・補足コメントは一切付けず、読み取った本文のみを返してください。" +
  "改行や箇条書きなど元の体裁はできるだけ保ってください。文字が無い場合は空文字を返してください。";

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
        message =
          "AI読み取りの上限に達しました。しばらく時間をおいてからお試しください。";
      } else if (geminiRes.status === 400 || geminiRes.status === 403) {
        message = "APIキーが無効か、権限がありません。設定を確認してください。";
      } else {
        message = `AI読み取りに失敗しました (${geminiRes.status})`;
      }

      return NextResponse.json(
        { error: message },
        { status: geminiRes.status === 429 ? 429 : 502 },
      );
    }

    const data = (await geminiRes.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

    return NextResponse.json({ text });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "OCR処理中にエラーが発生しました" }, { status: 500 });
  }
}
