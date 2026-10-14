import { CONTRACTS_VERSION, type Match } from "@cyl/contracts";
import syn0001 from "../../../../fixtures/valorant/syn-0001.json";
import syn0002 from "../../../../fixtures/valorant/syn-0002.json";
import { normalizeSyntheticMatch } from "@/domain/synthetic";
import { DEV_SEED_VIDEO_PATH, seedSyntheticData } from "./dev-seed";
import { createLocalStore, toStorageError, type Invoke } from "./local-store";
import { describeStorage } from "./useStorageStatus";

function normalized(raw: unknown, id: string): Match {
  const r = normalizeSyntheticMatch(raw, () => id);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const NOW = "2026-10-14T12:00:00.000Z";

/**
 * Lado nativo simulado, com as mesmas regras de identidade do Rust
 * (game, origin, externalId). Os testes reais do SQLite estao em
 * src-tauri/src/storage/tests.rs; aqui validamos a ponte e a validacao Zod.
 */
function fakeNative() {
  const matches = new Map<string, Match>();
  const videos: Record<string, unknown>[] = [];
  const markers: Record<string, unknown>[] = [];
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const invoke: Invoke = async (command, args) => {
    calls.push({ command, args });
    switch (command) {
      case "match_save": {
        const input = args?.input as { match: Match; contractsVersion: string };
        const existing = [...matches.values()].find(
          (m) => m.game === input.match.game && m.origin === input.match.origin && m.externalId === input.match.externalId,
        );
        if (existing) return { id: existing.id, outcome: "unchanged" };
        matches.set(input.match.id, input.match);
        return { id: input.match.id, outcome: "inserted" };
      }
      case "match_get": {
        const m = matches.get(args?.id as string);
        return m
          ? { id: m.id, game: m.game, origin: m.origin, externalId: m.externalId, matchSchemaVersion: 1, contractsVersion: CONTRACTS_VERSION, importedAt: NOW, updatedAt: NOW, match: m }
          : null;
      }
      case "video_attach": {
        const input = args?.input as Record<string, unknown>;
        const found = videos.find((v) => v.matchId === input.matchId && v.localPath === input.localPath);
        if (found) return { video: found, created: false };
        const video = { id: `v${videos.length + 1}`, matchId: input.matchId, fileName: "synthetic-demo.mp4", durationMs: input.durationMs, offsetMs: input.offsetMs, storage: "local", importedAt: NOW, localPath: input.localPath, updatedAt: NOW };
        videos.push(video);
        return { video, created: true };
      }
      case "marker_list":
        return markers.filter((m) => m.videoId === args?.videoId);
      case "marker_add": {
        const input = args?.input as Record<string, unknown>;
        const marker = { id: `k${markers.length + 1}`, videoId: input.videoId, timestampMs: input.timestampMs, label: input.label, roundNumber: input.roundNumber, source: "manual", createdAt: NOW, updatedAt: NOW };
        markers.push(marker);
        return marker;
      }
      default:
        throw { code: "not_found", message: `comando ${command} nao simulado` };
    }
  };
  return { invoke, calls, matches, markers };
}

describe("LocalStore (ponte com o SQLite nativo)", () => {
  it("valida com o contrato antes de gravar e envia a versao dos contratos", async () => {
    const native = fakeNative();
    const store = createLocalStore(native.invoke);
    const r = await store.saveMatch(normalized(syn0001, "m1"));
    expect(r).toEqual({ ok: true, value: { id: "m1", outcome: "inserted" } });
    expect(native.calls[0]?.args).toMatchObject({ input: { contractsVersion: CONTRACTS_VERSION } });
  });

  it("recusa partida invalida sem chamar o lado nativo", async () => {
    const native = fakeNative();
    const store = createLocalStore(native.invoke);
    const bad = { ...normalized(syn0001, "m1"), durationSeconds: -1 } as Match;
    const r = await store.saveMatch(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("invalid_data");
    expect(native.calls).toHaveLength(0);
  });

  it("le a partida gravada e a valida de novo com Zod, mantendo dado ausente", async () => {
    const store = createLocalStore(fakeNative().invoke);
    await store.saveMatch(normalized(syn0002, "m2"));
    const r = await store.getMatch("m2");
    if (!r.ok || !r.value) throw new Error("partida nao lida");
    expect(r.value.match.origin).toBe("synthetic");
    expect(r.value.match.participants.every((p) => p.headshotKills === undefined)).toBe(true);
    expect(await store.getMatch("nao-existe")).toEqual({ ok: true, value: null });
  });

  it("trata resposta nativa fora do contrato como dado corrompido", async () => {
    const store = createLocalStore(async () => ({
      id: "m1", externalId: "x", contractsVersion: "1.1.0", matchSchemaVersion: 1, importedAt: NOW, updatedAt: NOW,
      match: { schemaVersion: 1, id: "m1" },
    }));
    const r = await store.getMatch("m1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("corrupt");
  });

  it("repassa o erro tipado do Rust e mascara erros desconhecidos", async () => {
    const store = createLocalStore(async () => {
      throw { code: "conflict", message: "o id local ja pertence a outra partida" };
    });
    expect(await store.saveMatch(normalized(syn0001, "m1"))).toEqual({
      ok: false,
      error: { code: "conflict", message: "o id local ja pertence a outra partida" },
    });
    expect(toStorageError(new Error("C:\\Users\\alguem\\segredo"))).toEqual({
      code: "unavailable",
      message: "falha na comunicacao com o armazenamento local",
    });
  });

  it("valida referencias de video e marcacoes devolvidas", async () => {
    const store = createLocalStore(async (command) =>
      command === "marker_list" ? [{ id: "k1", videoId: "v1", timestampMs: -5, label: "x", source: "manual", createdAt: NOW, updatedAt: NOW }] : null,
    );
    const r = await store.listMarkers("v1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("corrupt");
  });

  it("envia opcionais ausentes como null para o Rust", async () => {
    const native = fakeNative();
    const store = createLocalStore(native.invoke);
    await store.addMarker({ videoId: "v1", timestampMs: 0, label: "x" });
    expect(native.calls[0]?.args).toEqual({ input: { videoId: "v1", timestampMs: 0, label: "x", description: null, roundNumber: null } });
  });
});

describe("semente sintetica de desenvolvimento", () => {
  it("usa um caminho absoluto do Windows (o Rust recusa caminho relativo)", () => {
    expect(DEV_SEED_VIDEO_PATH).toBe(["C:", "CYL-Sense-dev", "synthetic-demo.mp4"].join("\\"));
  });

  it("grava fixtures, video e marcacao, e e idempotente", async () => {
    const native = fakeNative();
    const store = createLocalStore(native.invoke);
    const first = await seedSyntheticData(store);
    expect(first.matches.map((m) => m.outcome)).toEqual(["inserted", "inserted"]);
    expect(first).toMatchObject({ videoCreated: true, markersAdded: 1 });

    const second = await seedSyntheticData(store);
    expect(second.matches.map((m) => m.outcome)).toEqual(["unchanged", "unchanged"]);
    expect(second.matches.map((m) => m.id)).toEqual(first.matches.map((m) => m.id));
    expect(second).toMatchObject({ videoCreated: false, markersAdded: 0 });
    expect(native.matches.size).toBe(2);
    expect(native.markers).toHaveLength(1);
    expect([...native.matches.values()].every((m) => m.origin === "synthetic")).toBe(true);
  });
});

describe("rodape de diagnostico", () => {
  it("descreve o estado do banco", () => {
    expect(describeStorage({ kind: "browser" })).toBe("banco local so no app");
    expect(describeStorage({ kind: "ready", status: { available: true, schemaVersion: 1, supportedSchemaVersion: 1, counts: { matches: 2, videos: 1, markers: 1 } } })).toBe(
      "banco v1 · 2 partidas",
    );
    expect(describeStorage({ kind: "ready", status: { available: false, supportedSchemaVersion: 1, error: { code: "corrupt", message: "x" } } })).toBe("banco indisponivel");
  });
});
