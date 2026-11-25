import Link from "next/link";
import { DISCLAIMER } from "@semaforo/shared";
import { getOwner } from "@/lib/owner";

export function SiteFooter() {
  const owner = getOwner();
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-page grid gap-8 py-10 text-[0.9375rem] md:grid-cols-[2fr_1fr]">
        <div>
          <p className="font-serif text-lg font-semibold">Semaforo</p>
          <p className="mt-2 max-w-prose text-ink-muted">{DISCLAIMER}</p>
          <p className="mt-4 text-ink-muted">
            {owner.name} · {owner.address} · P.IVA {owner.vat}
            <br />
            <a href={`mailto:${owner.email}`}>{owner.email}</a>
            {owner.pec ? <> · PEC {owner.pec}</> : null}
          </p>
        </div>
        <nav aria-label="Informazioni">
          <ul className="space-y-2">
            <li><Link prefetch={false} href="/metodologia">Metodologia e fonti</Link></li>
            <li><Link prefetch={false} href="/privacy">Privacy policy</Link></li>
            <li><Link prefetch={false} href="/contatti">Contatti</Link></li>
          </ul>
          <p className="mt-4 text-sm text-ink-muted">Nessun cookie, nessun sistema di tracciamento.</p>
        </nav>
      </div>
    </footer>
  );
}
