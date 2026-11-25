import Link from "next/link";
import { Logo } from "./Icon";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
        <Link prefetch={false} href="/" className="inline-flex items-center gap-2 text-ink no-underline hover:text-ink">
          <span className="text-accent">
            <Logo />
          </span>
          <span className="font-serif text-xl font-semibold">Semaforo</span>
          <span className="sr-only">: torna alla home</span>
        </Link>
        <nav aria-label="Principale">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem]">
            <li><Link prefetch={false} href="/#come-funziona">Come funziona</Link></li>
            <li><Link prefetch={false} href="/metodologia">Metodologia</Link></li>
            <li><Link prefetch={false} href="/contatti">Contatti</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
