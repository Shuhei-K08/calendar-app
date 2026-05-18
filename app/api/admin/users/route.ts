import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const normalizeRole = (role?: string | null) => (role ?? "").trim().toLowerCase();
const isAdminRole = (role?: string | null) => {
  const normalizedRole = normalizeRole(role);
  return normalizedRole === "admin" || normalizedRole === "admine";
};

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdmin>>;
type AuthSuccess = {
  admin: AdminClient;
  userId: string;
  email: string;
};

type AuthFailure = {
  error: string;
  status: 401 | 403 | 501;
  debug?: Record<string, unknown>;
};

const requireAdmin = async (request: Request): Promise<AuthSuccess | AuthFailure> => {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return {
      error:
        "サーバーに SUPABASE_SERVICE_ROLE_KEY が設定されていません。デプロイ環境の環境変数を設定してください。",
      status: 501,
    };
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return { error: "ログイン情報がありません。再度ログインしてください。", status: 401 };
  }

  const {
    data: { user },
  } = await admin.auth.getUser(token);

  if (!user) {
    return { error: "ログイン情報を確認できません。再度ログインしてください。", status: 401 };
  }

  const normalizedEmail = user.email?.toLowerCase() ?? "";
  const isEnvAdmin = getAdminEmails().includes(normalizedEmail);

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  let admittedAsAdmin = isAdminRole(profile?.role) || isEnvAdmin;

  // Bootstrap: if there are no admins in the system yet, automatically promote
  // the first user that visits the admin page so the app remains usable.
  if (!admittedAsAdmin) {
    const { count: adminCount } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((adminCount ?? 0) === 0) {
      await admin.from("profiles").update({ role: "admin" }).eq("id", user.id);
      admittedAsAdmin = true;
    }
  }

  if (!admittedAsAdmin) {
    return {
      error:
        "このアカウントはまだ管理者として登録されていません。既存の管理者に依頼するか、最初の管理者として登録してください。",
      debug: {
        email: user.email,
        userId: user.id,
        profileRole: profile?.role ?? null,
        adminEmailsConfigured: getAdminEmails().length > 0,
        canClaim: true,
      },
      status: 403,
    };
  }

  // Self-heal: ensure profile.role is "admin" if the env says so.
  if ((isEnvAdmin || isAdminRole(profile?.role)) && normalizeRole(profile?.role) !== "admin") {
    await admin.from("profiles").update({ role: "admin" }).eq("id", user.id);
  }

  return { admin, userId: user.id, email: user.email ?? "" };
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error, debug: auth.debug },
      { status: auth.status },
    );
  }

  const { data, error } = await auth.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = data.users.map((user) => user.id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await auth.admin.from("profiles").select("id, username, role").in("id", userIds)
    : { data: [], error: null };

  if (profilesError) {
    console.error("[admin/users] Failed to fetch profiles:", profilesError);
  }

  return NextResponse.json({
    currentUserId: auth.userId,
    users: data.users.map((user) => {
      const profile = profiles?.find((item) => item.id === user.id);
      // Generate username from email if not set
      const username = profile?.username?.trim() ||
        user.email?.split("@")[0] ||
        `User_${user.id.slice(0, 8)}`;

      return {
        id: user.id,
        email: user.email,
        username: username,
        role: isAdminRole(profile?.role) ? "admin" : "user",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        banned_until: user.banned_until,
      };
    }),
  });
}

// Bootstrap endpoint: allow the FIRST user to claim admin rights when no
// admin exists yet. Subsequent admin assignments must go through an existing
// admin via the PATCH endpoint.
export async function POST(request: Request) {
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY が未設定です。" },
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

  const { count: adminCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if ((adminCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          "すでに管理者が登録されています。既存の管理者に依頼して権限を付与してもらってください。",
      },
      { status: 403 },
    );
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error, debug: auth.debug },
      { status: auth.status },
    );
  }

  const body = (await request.json()) as {
    userId?: string;
    action?: "suspend" | "restore" | "make_admin" | "remove_admin" | "delete";
  };

  if (!body.userId || !body.action) {
    return NextResponse.json({ error: "操作対象がありません。" }, { status: 400 });
  }

  // Prevent admins from accidentally locking themselves out.
  if (body.userId === auth.userId && (body.action === "remove_admin" || body.action === "delete" || body.action === "suspend")) {
    return NextResponse.json(
      { error: "自分自身に対して停止・管理者解除・削除はできません。" },
      { status: 400 },
    );
  }

  if (body.action === "delete") {
    const { data: targetProfile } = await auth.admin
      .from("profiles")
      .select("role")
      .eq("id", body.userId)
      .maybeSingle();

    if (isAdminRole(targetProfile?.role)) {
      return NextResponse.json(
        { error: "管理者アカウントは管理画面から削除できません。" },
        { status: 400 },
      );
    }

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

  if (error) {
    console.error("[admin/users] profiles update error:", {
      userId: body.userId,
      action: body.action,
      error: error.message,
      details: error,
    });
    return NextResponse.json({
      error: `権限更新に失敗しました: ${error.message}`,
      debug: { errorCode: error.code, errorDetails: error.message },
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
