import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RepoMind — Repository Intelligence",
  description:
    "Understand any GitHub repository instantly. Claude AI analyzes commits, code, and PRs in real time using MCP tools.",
  openGraph: {
    title: "RepoMind — Repository Intelligence",
    description: "Understand any GitHub codebase instantly with Claude AI + MCP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${syne.variable} ${jetbrainsMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-jetbrains-mono), monospace" }}
      >
        {children}
      </body>
    </html>
  );
}
