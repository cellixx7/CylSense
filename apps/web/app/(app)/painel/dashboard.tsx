"use client";

import type { MeResponse } from "@cyl/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo, RiotDisclaimer } from "@/components/brand";
import { FormError } from "@/components/form";
import { Check, Flask } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { createApiClient } from "@/lib/api";
import { AgentsSection, HighlightsSection, LadderCard, MapsCard, ProfileHero, ProgressCard, RankingCard } from "./sections";

const api = createApiClient();

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; me: MeResponse };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function Dashboard({ justRegistered, justLinked }: { justRegistered: boolean; justLinked: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    const me = await api.me();
    if (me.ok) setState({ kind: "ready", me: me.data });
    else if (me.code === "unauthorized") router.replace("/entrar");
    else setState({ kind: "error" });
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await api.logout();
    router.push("/");
  }

  const me = state.kind === "ready" ? state.me : undefined;
  const account = me?.gameAccounts[0];
  const askToLink = justRegistered && me !== undefined && account === undefined;

  return (
    <div className="min-h-screen text-sm">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex flex-wrap items-center gap-7">
            <Link href="/" aria-label="CYL Sense, inicio" className="inline-flex items-center gap-2.5">
              <Logo />
              <span className="text-lg font-semibold tracking-tight">CYL Sense</span>
            </Link>
            <nav aria-label="Principal" className="flex flex-wrap gap-1">
              <Link href="/painel" aria-current="page" className="rounded-cyl bg-accent-soft px-3 py-2.5 font-medium text-on-accent-soft">
                Painel
              </Link>
              <Link href="/partidas" className="rounded-cyl px-3 py-2.5 text-muted hover:text-text">
                Partidas
              </Link>
              <Link href="/vincular" className="rounded-cyl px-3 py-2.5 text-muted hover:text-text">
                Conta Riot
              </Link>
            </nav>
          </div>
          {me ? (
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-xs text-muted">Dados de exemplo</span>
              <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-on-accent-soft">
                {initials(me.user.displayName)}
              </span>
              <button type="button" onClick={() => void logout()} className="rounded-cyl px-2 py-2 text-muted hover:text-text">
                Sair
              </button>
            </div>
          ) : (
            <div aria-hidden="true" className="flex items-center gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="size-9 rounded-full" />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 pt-7 pb-16">
        {state.kind === "error" && <FormError>Nao foi possivel carregar seu painel. Tente novamente em instantes.</FormError>}
        {state.kind !== "ready" && state.kind !== "error" && <DashboardSkeleton />}
        {me && (
          <>
            {justLinked && account && (
              <p role="status" className="flex items-center gap-2.5 rounded-cyl border border-border bg-surface p-3">
                <Check size={18} className="text-up" />
                Conta Riot {account.gameName}#{account.tagLine} vinculada.
              </p>
            )}
            <p role="note" className="flex gap-2.5 rounded-cyl border border-warning p-3">
              <Flask size={18} className="mt-px flex-none text-warning" />
              Dados de exemplo: os numeros abaixo sao sinteticos e mostram como o painel vai funcionar. Patente e partidas
              reais dependem da aprovacao da integracao com a Riot.
            </p>
            <ProfileHero displayName={me.user.displayName} riotId={account ? `${account.gameName}#${account.tagLine}` : undefined} />
            <div className="flex flex-wrap gap-5">
              <ProgressCard />
              <LadderCard />
            </div>
            <AgentsSection />
            <div className="flex flex-wrap gap-5">
              <RankingCard />
              <MapsCard />
            </div>
            <HighlightsSection />
          </>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted">
          <RiotDisclaimer />
        </div>
      </footer>

      {askToLink && <LinkQuestion onDismiss={() => router.replace("/painel")} />}
    </div>
  );
}

/** Pergunta exibida logo apos o cadastro, antes de levar a tela de vinculo. */
function LinkQuestion({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="vinc-q"
      aria-describedby="vinc-d"
      onCancel={onDismiss}
      className="m-auto w-[calc(100%-3rem)] max-w-md rounded-xl border border-border bg-surface p-7 text-text shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-accent">Conta criada</span>
          <h2 id="vinc-q" className="text-xl font-semibold tracking-tight">
            Deseja vincular sua conta Riot?
          </h2>
          <p id="vinc-d" className="text-sm leading-relaxed text-muted">
            Assim suas partidas de VALORANT entram no CYL Sense. Se preferir, da para vincular depois no seu perfil.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="h-11 rounded-cyl border border-border px-4.5 text-sm font-medium hover:bg-subtle"
          >
            Deixar pra la
          </button>
          <Link href="/vincular" className="inline-flex h-11 items-center rounded-cyl bg-accent px-5 text-sm font-semibold text-on-accent">
            Sim, vincular
          </Link>
        </div>
      </div>
    </dialog>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando seu painel" className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-6 rounded-2xl border border-border bg-surface p-8">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-6">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-9 w-72" />
          <div className="flex items-center gap-6">
            <Skeleton className="size-28 rounded-2xl" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <Skeleton className="min-h-80 flex-[1_1_360px] rounded-xl" />
      </div>
      <div className="flex flex-wrap gap-5">
        <Skeleton className="h-72 min-w-0 flex-[2_1_560px] rounded-2xl" />
        <Skeleton className="h-72 min-w-0 flex-[1_1_300px] rounded-2xl" />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
