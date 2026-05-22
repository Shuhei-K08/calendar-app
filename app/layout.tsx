import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f4f7fb",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
