import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CYL Sense", template: "%s | CYL Sense" },
  description: "Analise de desempenho para jogadores de VALORANT: estatisticas, revisao de video e recomendacoes de treino.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
