import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
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
  title: "Quorum | AI Group Chat",
  description:
    "Multi-AI group chat for consensus",
  openGraph: {
    title: "Quorum | AI Group Chat",
    description:
      "Ask a question and watch Gemini, Claude, GPT, and Perplexity debate it - then get a unified consensus verdict.",
    type: "website",
    siteName: "Quorum",
  },
  twitter: {
    card: "summary",
    title: "Quorum | AI Group Chat",
    description:
      "Ask a question and watch Gemini, Claude, GPT, and Perplexity debate it - then get a unified consensus verdict.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
