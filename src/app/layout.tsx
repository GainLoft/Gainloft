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
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,s=d.style,t=localStorage.getItem('theme'),dk=t==='dark'||((!t)&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(t)d.setAttribute('data-theme',t);s.background=dk?'#131722':'#fff';s.colorScheme=dk?'dark':'light'}catch(e){}})()` }} />
        <style dangerouslySetInnerHTML={{ __html: `body{opacity:0}body.ready{opacity:1;transition:opacity .15s ease-in}` }} />
      </head>
      <body className={`${inter.variable} ${outfit.variable} font-sans antialiased`} style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
        <Providers>
          <TopLoader />
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </Providers>
        <script dangerouslySetInnerHTML={{ __html: `requestAnimationFrame(function(){document.body.classList.add('ready')})` }} />
      </body>
    </html>
  );
}
