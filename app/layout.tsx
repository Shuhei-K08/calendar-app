import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_JP, Zen_Maru_Gothic } from "next/font/google";
import ThemeApplier from "@/app/components/ThemeApplier";
import "./globals.css";

// 本文: 読みやすいゴシック
const notoSansJp = Noto_Sans_JP({
  variable: "--font-body",
  weight: ["400", "500", "700"],
  preload: false,
  display: "swap",
});

// 見出し・数字: 丸みのあるゴシック
const zenMaru = Zen_Maru_Gothic({
  variable: "--font-display",
  weight: ["500", "700", "900"],
  preload: false,
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  themeColor: "#f6f5f1",
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
      className={`${notoSansJp.variable} ${zenMaru.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeApplier />
        {children}
      </body>
    </html>
  );
}
