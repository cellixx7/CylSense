import type { Metadata } from "next";

export const metadata: Metadata = { title: "Desktop" };

export default function DownloadPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">CYL Sense Desktop</h1>
      <p className="text-muted">
        O aplicativo para Windows e onde a analise se aprofunda: historico local, revisao de video importado
        manualmente e recomendacoes do CYL Coach, inclusive offline.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>Seus dados e videos ficam no seu computador.</li>
        <li>Nao le a memoria do jogo nem interage com o Vanguard.</li>
        <li>Nenhuma assistencia durante a partida.</li>
      </ul>
      <p className="rounded-cyl border border-border bg-surface p-4 text-sm">
        Download ainda indisponivel: o instalador sera publicado quando houver uma versao estavel.
      </p>
    </div>
  );
}
