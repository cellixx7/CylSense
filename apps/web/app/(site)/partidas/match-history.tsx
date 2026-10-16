"use client";

import type { MatchListResponse, MeResponse } from "@cyl/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/skeleton";
import { createApiClient } from "@/lib/api";

const api = createApiClient();

type State =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "error"; message: string }
  | { kind: "ready"; me: MeResponse; list: MatchListResponse };

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function MatchHistory() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [syncMessage, setSyncMessage] = useState<string>();

  const load = useCallback(async () => {
    const me = await api.me();
    if (!me.ok) {
      setState(me.code === "unauthorized" ? { kind: "signed_out" } : { kind: "error", message: me.message });
      return;
    }
    const list = await api.matches();
    setState(list.ok ? { kind: "ready", me: me.data, list: list.data } : { kind: "error", message: list.message });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sync() {
    setSyncMessage("Sincronizando...");
    const r = await api.sync();
    if (!r.ok) {
      setSyncMessage(r.code === "rate_limited" ? "Limite de requisicoes atingido. Tente mais tarde." : r.message);
      return;
    }
    setSyncMessage(`${r.data.imported} novas, ${r.data.unchanged} ja sincronizadas, ${r.data.rejected} rejeitadas.`);
    await load();
  }

  async function logout() {
    await api.logout();
    setState({ kind: "signed_out" });
  }

  if (state.kind === "loading") return <MatchHistorySkeleton />;
  if (state.kind === "error") return <p role="alert" className="text-sm">Nao foi possivel carregar: {state.message}</p>;
  if (state.kind === "signed_out") {
    return (
      <p className="text-sm text-muted">
        Entre na sua conta para ver seu historico.{" "}
        <Link href="/entrar" className="text-accent underline">
          Entrar
        </Link>
      </p>
    );
  }

  const { me, list } = state;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted">
          {me.gameAccounts.map((a) => `${a.gameName}#${a.tagLine}`).join(", ") || me.user.displayName}
        </span>
        <button type="button" onClick={() => void sync()} className="rounded-cyl border border-border px-3 py-1">
          Sincronizar partidas
        </button>
        <button type="button" onClick={() => void logout()} className="text-muted hover:text-text">
          Sair
        </button>
        {syncMessage && <span className="text-muted">{syncMessage}</span>}
      </div>

      {list.containsSyntheticData && (
        <p role="note" className="rounded-cyl border border-warning p-3 text-sm">
          Dados sinteticos de demonstracao. Estas partidas nao sao reais.
        </p>
      )}

      {list.matches.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma partida sincronizada ainda.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th className="py-2 font-normal">Data</th>
              <th className="py-2 font-normal">Mapa</th>
              <th className="py-2 font-normal">Modo</th>
              <th className="py-2 font-normal">Rounds</th>
              <th className="py-2 font-normal">Duracao</th>
              <th className="py-2 font-normal">Origem</th>
            </tr>
          </thead>
          <tbody>
            {list.matches.map((m) => (
              <tr key={m.id} className="border-b border-border">
                <td className="py-2 tabular-nums">{new Date(m.startedAt).toLocaleString("pt-BR")}</td>
                <td className="py-2">{m.map}</td>
                <td className="py-2">{m.mode}</td>
                <td className="py-2 tabular-nums">{m.roundsPlayed}</td>
                <td className="py-2 tabular-nums">{formatDuration(m.durationSeconds)}</td>
                <td className="py-2">{m.origin === "synthetic" ? "sintetica" : m.origin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-sm text-muted">
        Quer revisar estas partidas com video e receber recomendacoes de treino?{" "}
        <Link href="/download" className="text-accent underline">
          Conheca o CYL Sense Desktop
        </Link>
      </p>
    </div>
  );
}

function MatchHistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando partidas" className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-44" />
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
