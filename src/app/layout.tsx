import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TopLoader from "@/components/layout/TopLoader";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-logo", weight: ["700", "800"] });

export const metadata: Metadata = {
  title: "GainLoft",
  description: "Prediction markets for the world",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="dns-prefetch" href="https://clob.polymarket.com" />
        <link rel="preconnect" href="https://polymarket-upload.s3.us-east-2.amazonaws.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t){d.setAttribute('data-theme',t);d.style.background=t==='dark'?'#131722':'#ffffff'}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches){d.style.background='#131722'}}catch(e){}})()` }} />
      </head>
      <body className={`${inter.variable} ${outfit.variable} font-sans antialiased`} style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
        <Providers>
          <TopLoader />
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
