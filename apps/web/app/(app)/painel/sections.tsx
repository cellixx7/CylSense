"use client";

import Link from "next/link";
import { useState } from "react";
import { Silhouette } from "@/components/icons";
import * as ex from "@/lib/painel-exemplo";

const card = "flex min-w-0 flex-col rounded-2xl border border-border bg-surface";

const trendClass = { up: "text-up", down: "text-down", flat: "text-muted" } as const;

/** Emblema provisorio (nao e arte da Riot): hexagono na cor da patente. */
function TierBadge({ color, size }: { color: string; size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" fill="none">
      <path d="M24 4 41 14v20L24 44 7 34V14z" stroke={color} strokeWidth="3.5" />
      <path d="M24 15 31.5 19.5v9L24 33l-7.5-4.5v-9z" fill={color} />
    </svg>
  );
}

export function ProfileHero({ displayName, riotId }: { displayName: string; riotId: string | undefined }) {
  return (
    <section aria-label="Seu perfil" className="flex flex-wrap overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7 p-8">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-widest text-accent">TEMPORADA ATUAL · COMPETITIVO</span>
          <h1 className="text-4xl font-semibold tracking-tight">{displayName}</h1>
          {riotId ? (
            <span className="text-muted">{riotId}</span>
          ) : (
            <span className="text-muted">
              Conta Riot nao vinculada.{" "}
              <Link href="/vincular" className="text-accent">
                Vincular agora
              </Link>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div
            role="img"
            aria-label={`Emblema da patente ${ex.rank.tier} (espaco para a arte oficial)`}
            className="cyl-placeholder flex size-28 flex-none flex-col items-center justify-center gap-0.5 rounded-2xl border border-dashed border-border"
          >
            <TierBadge color={ex.currentTierColor} size={56} />
            <span className="text-[10px] text-muted">emblema oficial</span>
          </div>
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold" style={{ color: ex.currentTierColor }}>
                {ex.rank.tier}
              </span>
              <span className="text-muted">Pico da temporada: {ex.rank.peak}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted">
                <span>Rank Rating</span>
                <span className="font-semibold text-text tabular-nums">{ex.rank.rr} / 100 RR</span>
              </div>
              <div
                role="progressbar"
                aria-label="Rank Rating"
                aria-valuenow={ex.rank.rr}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2.5 overflow-hidden rounded-full bg-subtle"
              >
                <div className="h-full rounded-full" style={{ width: `${ex.rank.rr}%`, background: ex.currentTierColor }} />
              </div>
              <span className="text-xs text-muted">
                Faltam {100 - ex.rank.rr} RR para {ex.rank.next} · media de +{ex.rank.rrPerWin} por vitoria
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {ex.kpis.map((k) => (
            <div key={k.label} className="flex flex-col gap-0.5 rounded-xl bg-subtle p-3.5">
              <span className="text-xs text-muted">{k.label}</span>
              <span className="text-2xl font-semibold tabular-nums">{k.value}</span>
              <span className={`text-xs ${trendClass[k.trend]}`}>{k.delta}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        role="img"
        aria-label={`Arte do agente principal, ${ex.mainAgent.name} (espaco para a arte oficial)`}
        className="cyl-placeholder relative flex min-h-96 flex-[1_1_380px] items-end border-l border-border"
      >
        <Silhouette className="absolute bottom-0 left-1/2 h-[88%] -translate-x-1/2 text-muted opacity-35" />
        <div className="relative flex w-full items-end justify-between gap-3 p-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">Agente principal</span>
            <span className="text-3xl font-bold tracking-tight">{ex.mainAgent.name.toUpperCase()}</span>
            <span className="text-xs text-muted">
              {ex.mainAgent.role} · {ex.mainAgent.games} partidas
            </span>
          </div>
          <span className="rounded-full border border-dashed border-border bg-surface px-2.5 py-1 text-[11px] text-muted">
            [ARTE OFICIAL DO AGENTE]
          </span>
        </div>
      </div>
    </section>
  );
}

export function ProgressCard() {
  const points = ex.rrHistory.map((y, i) => `${Math.round(60 + (i * 560) / (ex.rrHistory.length - 1))},${y}`).join(" ");
  return (
    <section aria-labelledby="rr-title" className={`${card} flex-[2_1_560px] gap-4 p-6`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rr-title" className="text-lg font-semibold">
          Sua subida
        </h2>
        <span className="text-muted">Ultimas 20 partidas · Prata 3 → Ouro 2</span>
      </div>
      <svg
        role="img"
        aria-label="Grafico de evolucao de patente nas ultimas 20 partidas, de Prata 3 a Ouro 2"
        viewBox="0 0 640 220"
        className="h-auto w-full"
      >
        <rect x="0" y="0" width="640" height="60" fill="oklch(0.8 0.14 85 / 0.08)" />
        <rect x="0" y="60" width="640" height="60" fill="oklch(0.8 0.14 85 / 0.04)" />
        <rect x="0" y="120" width="640" height="100" fill="oklch(0.78 0.02 260 / 0.05)" />
        <line x1="0" x2="640" y1="60" y2="60" stroke="var(--cyl-border)" strokeDasharray="4 4" />
        <line x1="0" x2="640" y1="120" y2="120" stroke="var(--cyl-border)" strokeDasharray="4 4" />
        <text x="8" y="20" fill="var(--cyl-text-muted)" fontSize="11">
          Ouro 2
        </text>
        <text x="8" y="80" fill="var(--cyl-text-muted)" fontSize="11">
          Ouro 1
        </text>
        <text x="8" y="140" fill="var(--cyl-text-muted)" fontSize="11">
          Prata 3
        </text>
        <polyline points={points} fill="none" stroke="var(--cyl-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="620" cy="22" r="6" fill="var(--cyl-accent)" />
        <circle cx="620" cy="22" r="11" fill="none" stroke="var(--cyl-accent)" strokeOpacity="0.4" strokeWidth="2" />
      </svg>
      <ol aria-label="Ultimas 10 partidas" className="flex flex-wrap gap-1.5">
        {ex.recentResults.map((r, i) => (
          <li
            key={i}
            title={r === "V" ? "Vitoria" : "Derrota"}
            className={`inline-flex size-7 items-center justify-center rounded-md text-xs font-bold ${
              r === "V" ? "bg-accent-soft text-on-accent-soft" : "bg-subtle text-muted"
            }`}
          >
            {r}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LadderCard() {
  return (
    <section aria-labelledby="escada-title" className={`${card} flex-[1_1_300px] gap-3 p-6`}>
      <h2 id="escada-title" className="text-lg font-semibold">
        Escada de patentes
      </h2>
      <ol className="flex flex-col-reverse gap-1">
        {ex.tiers.map((t) => (
          <li
            key={t.name}
            aria-current={"current" in t ? "true" : undefined}
            className={`flex items-center gap-2.5 rounded-cyl px-2.5 py-1.5 ${
              "current" in t ? "bg-accent-soft outline outline-accent" : ""
            }`}
          >
            <TierBadge color={t.color} size={26} />
            <span className="flex-1 font-medium">{t.name}</span>
            {"note" in t && <span className="text-xs text-muted">{t.note}</span>}
          </li>
        ))}
      </ol>
      <span className="text-xs text-muted">Icones provisorios; no produto entram os emblemas oficiais.</span>
    </section>
  );
}

export function AgentsSection() {
  return (
    <section aria-labelledby="ag-title" className="flex flex-col gap-3.5">
      <h2 id="ag-title" className="text-lg font-semibold">
        Seus agentes
      </h2>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {ex.agents.map((a) => (
          <article key={a.name} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            <div
              role="img"
              aria-label={`Retrato de ${a.name} (espaco para a arte oficial)`}
              className="cyl-placeholder relative flex h-50 items-end justify-between p-3"
            >
              <Silhouette className="absolute bottom-0 left-1/2 h-[90%] -translate-x-1/2 text-muted opacity-30" />
              <span className="relative rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">{a.role}</span>
              <span className="relative text-[11px] text-muted">{a.games} partidas</span>
            </div>
            <div className="flex flex-col gap-2.5 px-4 pt-3.5 pb-4">
              <span className="text-lg font-bold tracking-wide">{a.name.toUpperCase()}</span>
              <dl className="grid grid-cols-3 gap-1.5 tabular-nums">
                <div className="flex flex-col">
                  <dt className="text-[11px] text-muted">Vitorias</dt>
                  <dd className="font-semibold">{a.win}%</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-[11px] text-muted">K/D</dt>
                  <dd className="font-semibold">{a.kd}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-[11px] text-muted">ACS</dt>
                  <dd className="font-semibold">{a.acs}</dd>
                </div>
              </dl>
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-subtle">
                <div className="h-full rounded-full bg-accent" style={{ width: `${a.win}%` }} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const CRITERIA: { id: ex.RankingCriterion; label: string }[] = [
  { id: "score", label: "CYL Score" },
  { id: "evolucao", label: "Evolucao" },
  { id: "headshot", label: "Headshot" },
];

export function RankingCard() {
  const [criterion, setCriterion] = useState<ex.RankingCriterion>("score");
  const rows = ex.friendsRanking[criterion];
  return (
    <section aria-labelledby="rk-title" className={`${card} flex-[3_1_520px] gap-3.5 p-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rk-title" className="text-lg font-semibold">
          Ranking entre amigos
        </h2>
        <div role="group" aria-label="Criterio do ranking" className="flex gap-1 rounded-xl bg-subtle p-1">
          {CRITERIA.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={criterion === c.id}
              onClick={() => setCriterion(c.id)}
              className={`h-8 rounded-cyl px-3 text-[13px] ${
                criterion === c.id ? "bg-surface font-semibold text-text" : "text-muted hover:text-text"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="flex flex-col gap-1.5">
        {rows.map((p, i) => (
          <li
            key={p.name}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${p.you ? "bg-accent-soft outline outline-accent" : "bg-subtle"}`}
          >
            <span className={`w-6 flex-none text-center text-base font-bold ${i === 0 ? "" : "text-muted"}`} style={i === 0 ? { color: ex.currentTierColor } : undefined}>
              {i + 1}
            </span>
            <span aria-hidden="true" className="inline-flex size-8.5 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-on-accent-soft">
              {p.you ? "EU" : `A${p.name.replace(/\D/g, "")}`}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-muted">
                {p.rank} · {p.agent}
              </span>
            </div>
            <span className="text-lg font-semibold tabular-nums">{p.value}</span>
            <span
              className={`w-9 text-right text-xs ${p.delta.startsWith("▲") ? "text-up" : p.delta.startsWith("▼") ? "text-down" : "text-muted"}`}
            >
              {p.delta}
            </span>
          </li>
        ))}
      </ol>
      <span className="text-xs text-muted">So aparecem amigos que tambem vincularam a conta Riot ao CYL Sense.</span>
    </section>
  );
}

export function MapsCard() {
  return (
    <section aria-labelledby="mapas-title" className={`${card} flex-[2_1_360px] gap-3.5 p-6`}>
      <h2 id="mapas-title" className="text-lg font-semibold">
        Seus mapas
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {ex.maps.map((m) => (
          <div
            key={m.name}
            role="img"
            aria-label={`${m.name}: ${m.win}% de vitorias em ${m.games} jogos (espaco para a imagem oficial do mapa)`}
            className="cyl-placeholder flex h-21 flex-col justify-between rounded-xl px-3 py-2.5"
          >
            <span className="font-bold tracking-wide">{m.name.toUpperCase()}</span>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-bold ${m.win >= 50 ? "text-up" : "text-down"}`}>{m.win}%</span>
              <span className="text-[11px] text-muted">{m.games} jogos</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HighlightsSection() {
  return (
    <section aria-labelledby="dest-title" className="flex flex-col gap-3.5">
      <h2 id="dest-title" className="text-lg font-semibold">
        Destaques da semana
      </h2>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {ex.highlights.map((h) => (
          <div key={h.title} className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-4">
            <span aria-hidden="true" className="inline-flex size-12 flex-none items-center justify-center rounded-xl bg-accent-soft text-[15px] font-bold text-on-accent-soft">
              {h.icon}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{h.title}</span>
              <span className="text-xs text-muted">{h.body}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
