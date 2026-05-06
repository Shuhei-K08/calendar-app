import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const requireAdmin = async (request: Request) => {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY が未設定です。", status: 501 as const };
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: "ログイン情報がありません。", status: 401 as const };
  }

  const {
    data: { user },
  } = await admin.auth.getUser(token);

  if (!user) {
    return { error: "ログイン情報を確認できません。", status: 401 as const };
  }

  const normalizedEmail = user.email?.toLowerCase() ?? "";
  const isEnvAdmin = getAdminEmails().includes(normalizedEmail);

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && !isEnvAdmin) {
    return {
      error:
        "このアカウントはまだ管理者として登録されていません。",
      status: 403 as const,
    };
  }

  if (isEnvAdmin && profile?.role !== "admin") {
    await admin.from("profiles").update({ role: "admin" }).eq("id", user.id);
  }

  return { admin };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = data.users.map((user) => user.id);
  const { data: profiles } = userIds.length
    ? await auth.admin.from("profiles").select("id, username, role").in("id", userIds)
    : { data: [] };

  return NextResponse.json({
    users: data.users.map((user) => {
      const profile = profiles?.find((item) => item.id === user.id);
      return {
        id: user.id,
        email: user.email,
        username: profile?.username ?? "名前未設定",
        role: profile?.role ?? "user",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        banned_until: user.banned_until,
      };
    }),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    userId?: string;
    action?: "suspend" | "restore" | "make_admin" | "remove_admin" | "delete";
  };

  if (!body.userId || !body.action) {
    return NextResponse.json({ error: "操作対象がありません。" }, { status: 400 });
  }

  if (body.action === "delete") {
    const { error } = await auth.admin.auth.admin.deleteUser(body.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "suspend" || body.action === "restore") {
    const { error } = await auth.admin.auth.admin.updateUserById(body.userId, {
      ban_duration: body.action === "suspend" ? "876000h" : "none",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await auth.admin
    .from("profiles")
    .update({ role: body.action === "make_admin" ? "admin" : "user" })
    .eq("id", body.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
