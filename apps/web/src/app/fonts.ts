import localFont from "next/font/local";

/** Font self-hosted (SIL OFL 1.1): nessuna richiesta a CDN esterni. */
export const atkinson = localFont({
  src: [
    { path: "../../../../packages/shared/fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../../packages/shared/fonts/atkinson-hyperlegible-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../../../../packages/shared/fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-atkinson",
  display: "swap",
});

export const sourceSerif = localFont({
  src: "../../../../packages/shared/fonts/source-serif-4-latin-wght-normal.woff2",
  weight: "200 900",
  variable: "--font-source-serif",
  display: "swap",
});
