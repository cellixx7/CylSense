import Link from "next/link";

const PILLARS = [
  { title: "O que aconteceu", body: "Estatisticas por partida e por round, com o tamanho da amostra sempre visivel." },
  { title: "Como aconteceu", body: "No desktop, voce associa suas gravacoes as partidas e revisa os momentos relevantes." },
  { title: "O que treinar", body: "Diagnosticos com evidencia rastreavel, separando fato de hipotese, e recomendacoes praticas." },
] as const;

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="max-w-2xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Entenda seu jogo. Evolua com evidencias.</h1>
        <p className="text-muted">
          CYL Sense transforma suas partidas de VALORANT em diagnosticos compreensiveis e em pontos concretos de treino.
          A analise basica fica na web; a revisao aprofundada, no aplicativo desktop.
        </p>
        <div className="flex gap-3 text-sm">
          <Link href="/entrar" className="rounded-cyl bg-accent px-4 py-2 font-medium text-bg">
            Conectar conta Riot
          </Link>
          <Link href="/download" className="rounded-cyl border border-border px-4 py-2">
            Conhecer o desktop
          </Link>
        </div>
      </section>

      <section aria-label="Como funciona" className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="bg-surface p-5">
            <h2 className="text-sm font-semibold">{p.title}</h2>
            <p className="mt-2 text-sm text-muted">{p.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
