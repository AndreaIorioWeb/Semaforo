import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { publicBaseUrl } from "@/lib/owner";
import { atkinson, sourceSerif } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const base = publicBaseUrl();
  return {
    metadataBase: new URL(base),
    title: { default: "Semaforo · Il controllo gratuito del tuo sito", template: "%s · Semaforo" },
    description:
      "Controlla gratis privacy, cookie, dati aziendali, vendita online e sicurezza di base del tuo sito. Nessuna registrazione, nessun cookie.",
    openGraph: {
      title: "Semaforo · Il controllo gratuito del tuo sito",
      description: "Privacy, cookie, dati aziendali e sicurezza di base del tuo sito in circa un minuto.",
      locale: "it_IT",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Semaforo, il controllo gratuito del tuo sito" }],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FBF8F2" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendering dinamico: serve per il nonce della CSP (src/proxy.ts).
  await connection();
  return (
    <html lang="it" className={`${atkinson.variable} ${sourceSerif.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <a
          href="#contenuto"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-surface"
        >
          Vai al contenuto
        </a>
        <SiteHeader />
        <main id="contenuto" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
