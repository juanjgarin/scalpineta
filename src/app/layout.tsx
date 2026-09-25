import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter } from "next/font/google";
import "./globals.css";

/** Kraken-Brand → Inter (títulos) */
const brand = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["600", "700"],
});

/** Kraken-Product → IBM Plex Sans (interfaz) */
const product = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Datos y precios → IBM Plex Mono */
const data = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "La Scalpineta",
  description:
    "PoC scalping signals for BTCUSDT Perpetual — liquidity sweeps & turtle soup on 1m–1D. Not financial advice.",
};

/** Aplica el tema guardado antes del primer pintado (evita el flash) */
const themeScript = `try{var t=localStorage.getItem("scalpineta:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${brand.variable} ${product.variable} ${data.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
