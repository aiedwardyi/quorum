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

// Runs synchronously in the browser before React hydrates so the theme
// is applied to <html> on first paint. Without this, navigating from
// the home page to /chat (or reloading /chat directly) flashes the
// default (light) background for one frame before the chat page's
// useEffect reads localStorage and adds the "dark" class.
//
// Whitelists the stored value against the known themes before calling
// classList.add(). An attacker or a stale localStorage entry could
// otherwise hold an invalid CSS class name (containing whitespace or
// other forbidden characters), which makes classList.add throw
// InvalidCharacterError. The catch then swallows the throw and the
// dark class never lands, reintroducing the light flash.
const themeInitScript = `(function(){try{var t=localStorage.getItem('quorum_theme')||'dark';if(t==='github')t='solarized';var a={light:1,solarized:1,dark:1,tokyonight:1,lovelace:1,gruvbox:1,catppuccin:1,nord:1};if(!a[t])t='dark';var c=document.documentElement.classList;if(t!=='light'&&t!=='solarized'){c.add('dark');if(t!=='dark')c.add(t);}else if(t==='solarized'){c.add('solarized');}}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning on <html> below: the inline theme-init
  // script mutates <html>.className before React hydrates, so the
  // client DOM differs from the server HTML on purpose. The
  // suppression is scoped to <html> only, children still get normal
  // mismatch checks.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
