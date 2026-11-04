import type { NextConfig } from "next";

// どのページにも付けるセキュリティの設定
const securityHeaders = [
  // ほかのサイトにこのアプリを埋め込ませない（なりすまし画面での誤操作を防ぐ）
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  // ファイルの種類をブラウザに勝手に推測させない
  { key: "X-Content-Type-Options", value: "nosniff" },
  // ほかのサイトへ移るとき、URLの中身（パスやパラメータ）を渡さない
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 使わない機能は止める（位置情報は地図のためにこのアプリだけ許可）
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  // いつも https で開く
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@holiday-jp/holiday_jp"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
