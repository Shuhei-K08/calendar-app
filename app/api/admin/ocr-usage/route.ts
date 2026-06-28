import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { nextPacificMidnight, startOfPacificDay } from "@/lib/quotaReset";

// 管理者向け: AI読み取り（Gemini OCR）の使用状況を返す。
// ocr_usage テーブル（supabase-ocr-usage.sql）が必要。
// Geminiの無料枠（gemini-2.5-flash 既定）の制限:
//   RPM(1分あたりリクエスト数) = 10
//   TPM(1分あたりトークン数)   = 250,000
//   RPD(1日あたりリクエスト数) = 250
// いずれも env で上書き可（GEMINI_LIMIT_RPM / TPM / RPD）。

const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const isAdminRole = (role?: string | null) => {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "admine";
};

const numEnv = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export async function GET(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "サーバーに SUPABASE_SERVICE_ROLE_KEY が設定されていません。" },
      { status: 501 },
    );
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "ログイン情報がありません。" }, { status: 401 });
  }

  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "ログイン情報を確認できません。" }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isEnvAdmin = getAdminEmails().includes(user.email?.toLowerCase() ?? "");
  if (!isAdminRole(profile?.role) && !isEnvAdmin) {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  // RPDは太平洋時間の当日0時から集計（Geminiの日次リセットに合わせる）
  const dayStart = startOfPacificDay();

  const { data: rows, error } = await admin
    .from("ocr_usage")
    .select("status, total_tokens, created_at")
    .gte("created_at", dayStart.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    const tableMissing =
      error.code === "PGRST205" || error.code === "42P01" || error.code === "PGRST204";
    const message = tableMissing
      ? "ocr_usage テーブルが見つかりません。SQLを実行したか確認し、数十秒待ってから再読み込みしてください（Supabaseのスキーマ反映待ちの場合があります）。"
      : `使用状況の取得でエラーが発生しました: ${error.message}`;
    return NextResponse.json(
      { error: message, code: error.code ?? null, detail: error.message },
      { status: 200 },
    );
  }

  const usageRows = rows ?? [];
  const successRows = usageRows.filter((r) => r.status === "success");
  const limitRows = usageRows.filter((r) => r.status === "limit");

  // 直近60秒のリクエスト（RPM/TPM用）
  const oneMinuteAgo = Date.now() - 60 * 1000;
  const recentRows = successRows.filter((r) => new Date(r.created_at).getTime() >= oneMinuteAgo);

  const limits = {
    rpm: numEnv("GEMINI_LIMIT_RPM", 10),
    tpm: numEnv("GEMINI_LIMIT_TPM", 250000),
    rpd: numEnv("GEMINI_LIMIT_RPD", 250),
  };

  const lastLimit = limitRows[0] ?? null;

  return NextResponse.json({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    // 直近1分間のリクエスト数（RPM）
    rpm: { used: recentRows.length, limit: limits.rpm },
    // 直近1分間の処理トークン数（TPM）
    tpm: {
      used: recentRows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
      limit: limits.tpm,
    },
    // 当日（太平洋時間）の累計リクエスト数（RPD）
    rpd: { used: successRows.length, limit: limits.rpd },
    // RPDのリセット時刻
    rpdResetAt: nextPacificMidnight().toISOString(),
    todayLimitHits: limitRows.length,
    lastLimitAt: lastLimit?.created_at ?? null,
  });
}
