import type { Metadata } from "next";
import { LeadForm } from "@/components/LeadForm";
import { getOwner } from "@/lib/owner";

export const metadata: Metadata = {
  title: "Contatti",
  description: "Chiedi a un professionista di sistemare i problemi trovati da Semaforo.",
};

export default async function ContattiPage({ searchParams }: { searchParams: Promise<{ sito?: string | string[] }> }) {
  const { sito } = await searchParams;
  const site = (Array.isArray(sito) ? sito[0] : sito)?.slice(0, 300) ?? "";
  const owner = getOwner();
  return (
    <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="eyebrow">Contatti</p>
        <h1 className="mt-2 text-4xl">Vuoi che sistemi io il tuo sito?</h1>
        <p className="mt-4 text-lg text-ink-muted">
          Sviluppo siti su misura, soprattutto in WordPress. Raccontami cosa ti serve: ti rispondo personalmente, senza impegno.
        </p>
        <p className="mt-4">
          Preferisci l&apos;email? Scrivi a <a href={`mailto:${owner.email}`}>{owner.email}</a>.
        </p>
      </div>
      <LeadForm defaultSite={site} />
    </div>
  );
}
