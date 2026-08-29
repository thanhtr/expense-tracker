import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
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
        {/* Flash prevention: apply saved theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');var dark=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(t==='dark'){document.documentElement.classList.add('dark')}else if(t==='light'){document.documentElement.classList.add('light')}else if(dark){document.documentElement.classList.add('dark')}if(t==='dark'||t==='light'){var c=dark?'#141418':'#f9f9f3';var metas=document.querySelectorAll('meta[name="theme-color"]');if(metas.length){metas[0].setAttribute('content',c);metas[0].removeAttribute('media');for(var i=1;i<metas.length;i++){metas[i].remove()}}else{var m=document.createElement('meta');m.name='theme-color';m.content=c;document.head.appendChild(m)}}}catch(e){}})();` }} />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* Register service worker */}
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'});})}` }} />
      </head>
      <body className="min-h-full flex flex-col bg-background pb-safe">
        <CategoriesProvider>
          <HouseholdMembersProvider>
            <Navigation />
            <main className="flex-1">{children}</main>
            <Toaster richColors closeButton position="bottom-right" />
          </HouseholdMembersProvider>
        </CategoriesProvider>
      </body>
    </html>
  );
}
