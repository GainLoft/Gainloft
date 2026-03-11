import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TopLoader from "@/components/layout/TopLoader";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "optional" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-logo", weight: ["700", "800"], display: "optional" });

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
        <style dangerouslySetInnerHTML={{ __html: `
:root{--bg:#fff;--bg-surface:#f5f5f5;--bg-card:#fff;--bg-hover:#fafafa;--bg-input:#f5f5f5;--text-primary:#0e0f11;--text-secondary:#77808d;--text-muted:#aeb4bc;--text-icon:#c8ccd2;--border:#e6e8ea;--border-light:#f0f1f3;--yes-green:#30a159;--no-red:#e23939;--brand-blue:#1452f0;--gauge-track:#e6e8ea;--dot-inactive:#d9dbdf;--chart-grid:#f0f1f3;--green-bg:rgba(48,161,89,.1);--red-bg:rgba(233,57,57,.1);--shadow-card:0 1px 3px rgba(0,0,0,.04);--gradient-fade:linear-gradient(to left,#fff,transparent)}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#131722;--bg-surface:#1a1e2e;--bg-card:#1e2230;--bg-hover:#252a3a;--bg-input:#1a1e2e;--text-primary:#e1e3e8;--text-secondary:#8b8fa3;--text-muted:#5d6175;--text-icon:#3d4156;--border:#2d3142;--border-light:#252a3a;--yes-green:#3fbf6a;--no-red:#f05454;--brand-blue:#4d8af0;--gauge-track:#2d3142;--dot-inactive:#3d4156;--chart-grid:#252a3a;--green-bg:rgba(63,191,106,.15);--red-bg:rgba(240,84,84,.15);--shadow-card:0 1px 3px rgba(0,0,0,.3);--gradient-fade:linear-gradient(to left,#131722,transparent)}}
:root[data-theme="dark"]{--bg:#131722;--bg-surface:#1a1e2e;--bg-card:#1e2230;--bg-hover:#252a3a;--bg-input:#1a1e2e;--text-primary:#e1e3e8;--text-secondary:#8b8fa3;--text-muted:#5d6175;--text-icon:#3d4156;--border:#2d3142;--border-light:#252a3a;--yes-green:#3fbf6a;--no-red:#f05454;--brand-blue:#4d8af0;--gauge-track:#2d3142;--dot-inactive:#3d4156;--chart-grid:#252a3a;--green-bg:rgba(63,191,106,.15);--red-bg:rgba(240,84,84,.15);--shadow-card:0 1px 3px rgba(0,0,0,.3);--gradient-fade:linear-gradient(to left,#131722,transparent)}
:root[data-theme="light"]{--bg:#fff;--bg-surface:#f5f5f5;--bg-card:#fff;--bg-hover:#fafafa;--bg-input:#f5f5f5;--text-primary:#0e0f11;--text-secondary:#77808d;--text-muted:#aeb4bc;--text-icon:#c8ccd2;--border:#e6e8ea;--border-light:#f0f1f3;--yes-green:#30a159;--no-red:#e23939;--brand-blue:#1452f0;--gauge-track:#e6e8ea;--dot-inactive:#d9dbdf;--chart-grid:#f0f1f3;--green-bg:rgba(48,161,89,.1);--red-bg:rgba(233,57,57,.1);--shadow-card:0 1px 3px rgba(0,0,0,.04);--gradient-fade:linear-gradient(to left,#fff,transparent)}
body{color:var(--text-primary);background:var(--bg)}
` }} />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,s=d.style,t=localStorage.getItem('theme'),dk=t==='dark'||((!t)&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(t)d.setAttribute('data-theme',t);s.colorScheme=dk?'dark':'light'}catch(e){}})()` }} />
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
