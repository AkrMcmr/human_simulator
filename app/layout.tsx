import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human World Lab — 人間モデル実験室",
  description: "二人の知覚・予測・行動・学習を、同じ条件で観察し比較する実験室。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
