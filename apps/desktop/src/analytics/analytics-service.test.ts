import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Match } from "@cyl/contracts";
import { normalizeMatch } from "@cyl/core";
import { valorantSyntheticAdapter } from "@cyl/game-adapter-valorant";
import { memoryStore } from "@/test/memory-store";
import { analyzeLoadedMatch, createAnalyticsService } from "./analytics-service";

function fixture(name: string): Match {
  const raw: unknown = JSON.parse(readFileSync(resolve(process.cwd(), "../../fixtures/valorant", name), "utf8"));
  const r = normalizeMatch(valorantSyntheticAdapter, raw, { newId: () => `id-${name}` });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

async function seeded() {
  const mem = memoryStore();
  await mem.store.saveMatches([fixture("syn-0001.json"), fixture("syn-0002.json")]);
  return { mem, service: createAnalyticsService(mem.store) };
}

describe("servico de analytics do desktop", () => {
  it("analisa uma partida gravada no LocalStore", async () => {
    const { service } = await seeded();
    const r = await service.analyzeMatch("id-syn-0001.json", "p1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.displayName).toBe("Synth Alpha");
      expect(r.value.metrics.find((m) => m.key === "kd_ratio")).toMatchObject({ status: "available", value: 3 });
    }
  });

  it("analisa uma sessao com as partidas do banco, em ordem cronologica", async () => {
    const { service } = await seeded();
    const r = await service.analyzeSession("sessao-local", [
      { matchId: "id-syn-0002.json", playerRef: "p1" },
      { matchId: "id-syn-0001.json", playerRef: "p1" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.matches.map((m) => m.externalId)).toEqual(["syn-0001", "syn-0002"]);
      expect(r.value.context.containsSynthetic).toBe(true);
    }
  });

  it("partida inexistente, jogador inexistente e falha do banco viram erros tipados", async () => {
    const { mem, service } = await seeded();
    expect(await service.analyzeMatch("nao-existe", "p1")).toEqual({
      ok: false,
      error: { code: "not_found", message: "partida nao encontrada no banco local" },
    });
    const player = await service.analyzeMatch("id-syn-0001.json", "p42");
    expect(player.ok ? null : player.error.code).toBe("player_not_found");
    mem.failWith({ code: "unavailable", message: "armazenamento local indisponivel" });
    const storage = await service.analyzeSession("s", [{ matchId: "id-syn-0001.json", playerRef: "p1" }]);
    expect(storage.ok ? null : storage.error).toEqual({ code: "storage", message: "armazenamento local indisponivel", storageCode: "unavailable" });
  });

  it("recusa sessao acima do limite sem ler o banco", async () => {
    const { mem, service } = await seeded();
    const spy = vi.spyOn(mem.store, "getMatch");
    const r = await service.analyzeSession("s", Array.from({ length: 501 }, (_, i) => ({ matchId: `m${i}`, playerRef: "p1" })));
    expect(r.ok ? null : r.error.code).toBe("too_many_matches");
    expect(spy).not.toHaveBeenCalled();
  });

  it("excecao inesperada do motor nao escapa para a interface", () => {
    const broken = { ...fixture("syn-0001.json"), get participants(): never { throw new Error("boom"); } } as unknown as Match;
    expect(analyzeLoadedMatch(broken, "p1")).toEqual({
      ok: false,
      error: { code: "engine_failure", message: "falha inesperada no motor de analise" },
    });
  });
});
