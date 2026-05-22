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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

// Inline script — runs before React hydrates to prevent flash of light theme.
const themeBootstrap = `
(function () {
  try {
    var saved = localStorage.getItem('sharecal_theme');
    var settings = localStorage.getItem('calendar_settings');
    var parsed = settings ? JSON.parse(settings) : null;
    var mode = saved || (parsed && parsed.themeMode) || 'system';
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var apply = function () {
      var dark = mode === 'dark' || (mode === 'system' && media && media.matches);
      if (dark) document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    if (mode === 'system' && media) {
      if (media.addEventListener) media.addEventListener('change', apply);
      else if (media.addListener) media.addListener(apply);
    }
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
