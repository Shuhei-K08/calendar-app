import type { Metadata, Viewport } from "next";
import ThemeApplier from "@/app/components/ThemeApplier";
import ScrollLock from "@/app/components/ScrollLock";
import "./globals.css";

// 日本語フォントはファイル数がとても多く、next/font だとビルドで失敗することがあるため
// Google Fonts から直接読み込む（--font-body / --font-display は globals.css で定義）
const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Manrope:wght@600;700;800&display=swap";

export const metadata: Metadata = {
  title: "ShareCal",
  description: "勤務予定を共有できるカレンダーアプリ ShareCal",
  applicationName: "ShareCal",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ShareCal",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

// Inline script — runs before React hydrates to prevent flash of light theme.
const themeBootstrap = `
(function () {
  try {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = 'light';
    localStorage.removeItem('sharecal_theme');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeApplier />
        <ScrollLock />
        {children}
      </body>
    </html>
  );
}
