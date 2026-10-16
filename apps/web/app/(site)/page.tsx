import Link from "next/link";
import { ArrowRight, Check, Download, LinkIcon } from "@/components/icons";

const SAMPLE_STATS = [
  { label: "K/D", value: "1,21" },
  { label: "Headshot", value: "24%" },
  { label: "Primeiro abate", value: "18%" },
] as const;

const PILLARS = [
  {
    step: "01",
    title: "O que aconteceu",
    body: "Estatisticas por partida e por round, sempre com o tamanho da amostra a vista. Nada de media sobre tres jogos.",
  },
  {
    step: "02",
    title: "Como aconteceu",
    body: "No desktop, voce associa suas gravacoes as partidas e revisa os momentos que pesaram no resultado.",
  },
  {
    step: "03",
    title: "O que treinar",
    body: "Diagnosticos que separam fato de hipotese, cada um com evidencia rastreavel, e treinos praticos para cada ponto.",
  },
] as const;

const TRUST = [
  {
    title: "So a API oficial da Riot",
    body: "Nada de ler a memoria do jogo, contornar o Vanguard ou usar acessos nao autorizados.",
  },
  {
    title: "Local primeiro",
    body: "O app desktop guarda e analisa tudo no seu computador. Voce decide o que fica e o que sai.",
  },
  {
    title: "IA so com o seu sim",
    body: "O motor de analise roda localmente. A IA externa e opcional e so entra com o seu consentimento.",
  },
] as const;

export default function HomePage() {
  return (
    <main>
      <section
        aria-labelledby="hero-title"
        className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-6 pt-20 pb-16"
      >
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
          <span className="self-start rounded-full border border-border bg-subtle px-2.5 py-1 text-xs text-muted">
            VALORANT · analise de desempenho
          </span>
          <h1 id="hero-title" className="text-5xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-6xl">
            Entenda seu jogo.
            <br />
            <span className="text-accent">Evolua com evidencias.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">
            As estatisticas mostram o que aconteceu, o video mostra como, e o CYL Sense aponta o que treinar. Sem
            achismo: cada diagnostico vem com a evidencia que o sustenta.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/criar-conta"
              className="inline-flex h-12 items-center gap-2 rounded-cyl bg-accent px-5 font-semibold text-on-accent"
            >
              Criar minha conta
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/entrar"
              className="inline-flex h-12 items-center rounded-cyl border border-border px-5 font-medium hover:bg-subtle"
            >
              Ja tenho conta
            </Link>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted">
            <LinkIcon size={14} />
            Crie seu perfil agora e vincule sua conta Riot quando quiser.
          </p>
        </div>

        <figure
          aria-label="Exemplo de analise com dados sinteticos"
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3 rounded-xl border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Ascent · 13–11 · Vitoria</span>
              <span className="text-xs text-muted">Jett · 24 rounds</span>
            </div>
            <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-xs text-muted">
              Exemplo · dados sinteticos
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SAMPLE_STATS.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 rounded-cyl bg-subtle p-3">
                <span className="text-xs text-muted">{s.label}</span>
                <span className="text-2xl font-semibold tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-cyl border border-border p-3.5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-on-accent-soft">Fato</span>
              <span className="text-xs text-muted">Amostra: 9 rounds de defesa</span>
            </div>
            <p className="text-sm">Em 6 de 9 rounds no bomb B voce morreu antes de 0:20 sem troca de abate.</p>
          </div>
          <div className="flex flex-col gap-2 rounded-cyl border border-dashed border-border p-3.5">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">Hipotese</span>
              <span className="text-xs text-muted">Confirme no video</span>
            </div>
            <p className="text-sm">
              Posicao muito exposta no inicio do round. Treino sugerido: segurar angulo recuado com apoio de utilitaria.
            </p>
          </div>
        </figure>
      </section>

      <section id="como-funciona" aria-labelledby="como-title" className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-18">
          <div className="flex max-w-2xl flex-col gap-2">
            <h2 id="como-title" className="text-3xl font-semibold tracking-tight">
              Como funciona
            </h2>
            <p className="text-muted">Tres perguntas, nessa ordem. Cada resposta se apoia na anterior.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.step} className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-6">
                <span className="text-xs font-semibold tracking-widest text-accent">{p.step}</span>
                <h3 className="text-lg font-semibold">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="seus-dados" aria-labelledby="dados-title" className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-12 px-6 py-18">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
            <h2 id="dados-title" className="text-3xl font-semibold tracking-tight">
              Seus dados, sob seu controle
            </h2>
            <p className="text-muted">O CYL Sense joga limpo com voce e com o jogo.</p>
          </div>
          <ul className="flex min-w-0 flex-[2_1_520px] flex-col">
            {TRUST.map((t) => (
              <li key={t.title} className="flex gap-4 border-b border-border py-4.5">
                <Check size={20} className="mt-0.5 flex-none text-accent" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{t.title}</span>
                  <span className="text-sm leading-relaxed text-muted">{t.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="desktop-title" className="px-6 pb-22">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 rounded-xl border border-border bg-accent-soft p-10">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2 text-on-accent-soft">
            <h2 id="desktop-title" className="text-3xl font-semibold tracking-tight">
              A revisao completa fica no desktop
            </h2>
            <p>Importe suas partidas, associe seus videos MP4 e receba o plano de treino. Funciona offline, no Windows.</p>
          </div>
          <Link
            href="/download"
            className="inline-flex h-12 items-center gap-2 rounded-cyl bg-accent px-5 font-semibold text-on-accent"
          >
            <Download size={18} />
            Conhecer o desktop
          </Link>
        </div>
      </section>
    </main>
  );
}
