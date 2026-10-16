import Link from "next/link";
import type { ReactNode } from "react";
import { HomeLink, RiotDisclaimer } from "@/components/brand";

/** Telas de conta: cabecalho enxuto e conteudo centralizado. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <HomeLink />
          <Link href="/" className="p-3 text-sm text-muted hover:text-text">
            Voltar ao inicio
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-14">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted">
          <RiotDisclaimer />
        </div>
      </footer>
    </div>
  );
}
