"use client";

import type { AuthMode, MeResponse } from "@cyl/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormError } from "@/components/form";
import { Check, ExternalLink, Flask } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { createApiClient } from "@/lib/api";

const api = createApiClient();

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; me: MeResponse; mode: AuthMode | "offline" };

const BENEFITS = [
  "Suas partidas de VALORANT entram no CYL Sense sem importacao manual.",
  "O login acontece na pagina oficial da Riot. Sua senha da Riot fica so com a Riot.",
  "Voce pode desvincular a qualquer momento nesta mesma tela.",
] as const;

export function LinkRiot({ error }: { error?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [unlinking, setUnlinking] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me();
    if (!me.ok) {
      if (me.code === "unauthorized") router.replace("/entrar");
      else setState({ kind: "error" });
      return;
    }
    const status = await api.authStatus();
    setState({ kind: "ready", me: me.data, mode: status.ok ? status.data.mode : "offline" });
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") return <LinkSkeleton />;
  if (state.kind === "error") return <FormError>Nao foi possivel carregar seu perfil. Tente novamente em instantes.</FormError>;

  const account = state.me.gameAccounts[0];

  async function unlink(accountId: string) {
    setUnlinking(true);
    await api.unlinkAccount(accountId);
    setUnlinking(false);
    await load();
  }

  return (
    <section aria-labelledby="vinc-title" className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-8">
      <div className="flex flex-col gap-1.5">
        <h1 id="vinc-title" className="text-2xl font-semibold tracking-tight">
          {account ? "Conta Riot vinculada" : "Vincule sua conta Riot"}
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          {account
            ? "Tudo pronto. Suas partidas vao aparecer no seu painel."
            : "E opcional. Seu perfil ja funciona sem isso, e voce pode vincular depois."}
        </p>
      </div>

      {error && <FormError>{error}</FormError>}

      {account ? (
        <div className="flex items-center justify-between gap-3 rounded-cyl border border-border bg-subtle px-4 py-3.5">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Riot ID vinculado</span>
            <span className="font-semibold">
              {account.gameName}#{account.tagLine}
            </span>
          </div>
          <button
            type="button"
            disabled={unlinking}
            onClick={() => void unlink(account.id)}
            className="rounded-cyl px-3 py-2 text-sm text-accent hover:bg-bg disabled:opacity-60"
          >
            {unlinking ? "Desvinculando..." : "Desvincular"}
          </button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3 text-sm">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2.5">
                <Check size={18} className="mt-px flex-none text-accent" />
                {b}
              </li>
            ))}
          </ul>

          {state.mode === "mock" && (
            <>
              <p className="flex gap-2.5 rounded-cyl border border-warning p-3 text-sm">
                <Flask size={18} className="mt-px flex-none text-warning" />
                Modo demonstracao: o vinculo e simulado e as partidas sao sinteticas. Nenhum dado real da Riot e usado.
              </p>
              <a href={api.riotLinkUrl} className="flex h-12 items-center justify-center gap-2.5 rounded-cyl bg-accent font-semibold text-on-accent">
                Vincular conta Riot (demonstracao)
                <ExternalLink size={18} />
              </a>
            </>
          )}
          {state.mode !== "mock" && (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled
                className="h-12 cursor-not-allowed rounded-cyl border border-border bg-subtle font-semibold text-muted"
              >
                Vincular conta Riot
              </button>
              <p className="text-[13px] leading-5 text-muted">
                {state.mode === "offline"
                  ? "Servico indisponivel no momento. Tente novamente em instantes."
                  : "O vinculo com a Riot ainda depende de aprovacao oficial da Riot Games. Enquanto isso, voce pode importar partidas pelo app desktop."}
              </p>
            </div>
          )}
        </>
      )}

      <Link
        href="/painel"
        className="flex h-11 items-center justify-center rounded-cyl border border-border text-sm font-medium hover:bg-subtle"
      >
        {account ? "Ir para o painel" : "Fazer isso depois"}
      </Link>
    </section>
  );
}

function LinkSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-8">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-full" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-10/12" />
        <Skeleton className="h-4 w-9/12" />
      </div>
      <Skeleton className="h-12 w-full rounded-cyl" />
      <Skeleton className="h-11 w-full rounded-cyl" />
    </div>
  );
}
