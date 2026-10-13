import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CYL Sense", template: "%s | CYL Sense" },
  description: "Analise de desempenho para jogadores de VALORANT: estatisticas, revisao de video e recomendacoes de treino.",
};

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/partidas", label: "Minhas partidas" },
  { href: "/download", label: "Desktop" },
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              CYL Sense
            </Link>
            <nav aria-label="Principal" className="flex gap-5 text-sm text-muted">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-text">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-muted">
          CYL Sense nao e afiliado a Riot Games. VALORANT e marca da Riot Games, Inc.
        </footer>
      </body>
    </html>
  );
}
