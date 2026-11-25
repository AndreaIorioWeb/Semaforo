import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-20">
      <h1 className="text-4xl">Pagina non trovata</h1>
      <p className="mt-3 text-lg text-ink-muted">L&apos;indirizzo non corrisponde a nessuna pagina di Semaforo.</p>
      <Link prefetch={false} href="/" className="btn btn-primary mt-6">Torna alla home</Link>
    </div>
  );
}
