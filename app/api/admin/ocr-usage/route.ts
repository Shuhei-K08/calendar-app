import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

// 管理者向け: AI読み取り（Gemini OCR）の使用状況を返す。
// ocr_usage テーブル（supabase-ocr-usage.sql）が必要。

const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const isAdminRole = (role?: string | null) => {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "admin" || normalized === "admine";
};

// 日本時間（JST）での「今日の0時」をUTC ISO文字列で返す
const startOfJstTodayIso = () => {
  const now = Date.now();
  const jst = new Date(now + 9 * 3600 * 1000);
  const midnightUtcMs =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600 * 1000;
  return new Date(midnightUtcMs).toISOString();
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

  const startIso = startOfJstTodayIso();

  // 今日の使用記録を取得
  const { data: rows, error } = await admin
    .from("ocr_usage")
    .select("status, total_tokens, created_at")
    .gte("created_at", startIso)
    .order("created_at", { ascending: false });

  if (error) {
    // テーブル未作成など
    return NextResponse.json(
      { error: "使用状況を取得できませんでした。ocr_usage テーブルのSQLを実行してください。", detail: error.message },
      { status: 200 },
    );
  }

  const usageRows = rows ?? [];
  const successRows = usageRows.filter((r) => r.status === "success");
  const limitRows = usageRows.filter((r) => r.status === "limit");

  // 直近の上限到達（今日に限らず全期間）
  const { data: lastLimit } = await admin
    .from("ocr_usage")
    .select("created_at")
    .eq("status", "limit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    todayCount: successRows.length,
    todayTokens: successRows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
    todayLimitHits: limitRows.length,
    lastLimitAt: lastLimit?.created_at ?? null,
    // 無料枠の目安（公式に保証された値ではない概算）
    dailyRequestEstimate: 250,
  });
}
