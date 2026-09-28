import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { OfflineBanner } from "@/components/OfflineBanner";
import { CategoriesProvider } from "@/components/CategoriesProvider";
import { HouseholdMembersProvider } from "@/components/HouseholdMembersProvider";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track and manage your expenses with ease",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Expenses",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Matches the app background in each mode so the iOS status bar blends in
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f3" },
    { media: "(prefers-color-scheme: dark)",  color: "#141418" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Flash prevention: apply an EXPLICIT saved theme before first paint.
          When the user has never chosen light/dark ('theme' unset — "System"), this
          deliberately does nothing: no class is added, and the default media-conditioned
          <meta name="theme-color"> tags from the `viewport` export below are left alone.
          globals.css already has a `@media (prefers-color-scheme: dark)` fallback for the
          no-class case, so system theme changes are followed live by the browser itself —
          no JS needed, and no risk of an installed PWA (which can stay resident for hours
          without a full reload) getting stuck on whatever the OS theme was at cold launch.
        */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.classList.add(t);var c=t==='dark'?'#141418':'#f9f9f3';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.remove()});var m=document.createElement('meta');m.name='theme-color';m.content=c;document.head.appendChild(m)}}catch(e){}})();` }} />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Register service worker */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'});})}` }} />
      </head>
      <body className="min-h-full flex flex-col bg-background pb-safe">
        <CategoriesProvider>
          <HouseholdMembersProvider>
            <OfflineBanner />
            <Navigation />
            <main className="flex-1">{children}</main>
            <Toaster richColors closeButton position="bottom-right" />
          </HouseholdMembersProvider>
        </CategoriesProvider>
      </body>
    </html>
  );
}
