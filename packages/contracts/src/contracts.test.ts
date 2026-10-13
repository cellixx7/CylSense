import {
  type AnalysisSession,
  checkFindingInContext,
  checkRecommendationLinks,
  checkVideoMarker,
  CoachingRecommendation,
  CONTRACTS_VERSION,
  LocalImportEnvelope,
  matchToVideoTimeMs,
  VideoMarker,
  videoToMatchTimeMs,
  Finding,
  HealthResponse,
  Match,
  type Match as MatchType,
  VideoReference,
} from "./index";

function validMatch(): MatchType {
  return {
    schemaVersion: 1,
    id: "m-1",
    game: "valorant",
    origin: "synthetic",
    externalId: "syn-0001",
    map: "Ascent",
    mode: "competitive",
    startedAt: "2026-10-01T20:00:00.000Z",
    durationSeconds: 1800,
    participants: [
      { playerRef: "p1", displayName: "Alpha", team: "red", agent: "Jett", kills: 2, deaths: 1, assists: 0 },
      { playerRef: "p2", displayName: "Bravo", team: "blue", agent: "Sova", kills: 1, deaths: 2, assists: 1 },
    ],
    rounds: [{ number: 1, winningTeam: "red" }],
    events: [{ id: "e1", roundNumber: 1, type: "kill", timeMs: 1000, actorRef: "p1", targetRef: "p2" }],
  };
}

describe("Match", () => {
  it("aceita uma partida normalizada valida", () => {
    expect(Match.safeParse(validMatch()).success).toBe(true);
  });

  it("rejeita schemaVersion diferente", () => {
    expect(Match.safeParse({ ...validMatch(), schemaVersion: 2 }).success).toBe(false);
  });

  it("rejeita playerRef duplicado", () => {
    const m = validMatch();
    m.participants.push({ ...m.participants[0]! });
    expect(Match.safeParse(m).success).toBe(false);
  });

  it("rejeita evento que aponta para participante ou round inexistente", () => {
    const m1 = validMatch();
    m1.events[0] = { ...m1.events[0]!, targetRef: "ghost" };
    expect(Match.safeParse(m1).success).toBe(false);

    const m2 = validMatch();
    m2.events[0] = { ...m2.events[0]!, roundNumber: 9 };
    expect(Match.safeParse(m2).success).toBe(false);
  });

  it("rejeita origem desconhecida", () => {
    expect(Match.safeParse({ ...validMatch(), origin: "scraped" }).success).toBe(false);
  });
});

describe("Finding", () => {
  const evidence = [{ kind: "metric", matchId: "m-1", metricKey: "first_death_rate", value: 0.4 }];

  it("aceita fato com evidencia", () => {
    const r = Finding.safeParse({ kind: "fact", id: "f1", sessionId: "s1", title: "t", statement: "s", evidence });
    expect(r.success).toBe(true);
  });

  it("rejeita diagnostico sem evidencia", () => {
    const r = Finding.safeParse({ kind: "fact", id: "f1", sessionId: "s1", title: "t", statement: "s", evidence: [] });
    expect(r.success).toBe(false);
  });

  it("exige confianca e limitacoes em hipoteses", () => {
    const base = { kind: "hypothesis", id: "f2", sessionId: "s1", title: "t", statement: "s", evidence };
    expect(Finding.safeParse(base).success).toBe(false);
    expect(Finding.safeParse({ ...base, confidence: 0.6, limitations: [] }).success).toBe(false);
    expect(Finding.safeParse({ ...base, confidence: 0.6, limitations: ["amostra pequena"] }).success).toBe(true);
    expect(Finding.safeParse({ ...base, confidence: 1.5, limitations: ["x"] }).success).toBe(false);
  });
});

describe("CoachingRecommendation", () => {
  it("exige ao menos um Finding de origem", () => {
    const rec = { id: "r1", sessionId: "s1", title: "t", practice: "p", priority: "high" };
    expect(CoachingRecommendation.safeParse({ ...rec, findingIds: [] }).success).toBe(false);
    expect(CoachingRecommendation.safeParse({ ...rec, findingIds: ["f1"] }).success).toBe(true);
  });
});

describe("VideoReference", () => {
  const video = {
    id: "v1",
    fileName: "partida.mp4",
    durationMs: 60_000,
    offsetMs: -1500,
    storage: "local",
    importedAt: "2026-10-01T21:00:00.000Z",
  };

  it("aceita somente o nome do arquivo, sem caminho", () => {
    expect(VideoReference.safeParse(video).success).toBe(true);
    expect(VideoReference.safeParse({ ...video, fileName: "C:\\Users\\x\\partida.mp4" }).success).toBe(false);
  });
});

describe("HealthResponse", () => {
  it("fixa a versao dos contratos", () => {
    expect(HealthResponse.safeParse({ status: "ok", contractsVersion: CONTRACTS_VERSION }).success).toBe(true);
    expect(HealthResponse.safeParse({ status: "ok", contractsVersion: "0.0.1" }).success).toBe(false);
  });
});

const messages = (input: unknown): string[] => {
  const r = Match.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("Match - consistencia (P0-02)", () => {
  it("aceita lados, condicao de vitoria, placar e contadores opcionais coerentes", () => {
    const m = validMatch();
    m.rounds[0] = { number: 1, winningTeam: "red", attackingTeam: "red", winCondition: "spike_detonated" };
    m.result = { score: { red: 1, blue: 0 }, winner: "red" };
    m.participants = m.participants.map((p) => ({ ...p, headshotKills: 1, damageDealt: 300 }));
    m.events.push({ id: "e2", roundNumber: 1, type: "spike_plant", timeMs: 2000, actorRef: "p1" });
    expect(messages(m)).toEqual([]);
  });

  it("rejeita placar ou vencedor incoerentes", () => {
    const m = validMatch();
    m.result = { score: { red: 0, blue: 1 }, winner: "blue" };
    expect(messages(m)).toContain("placar diferente dos rounds");
    m.result = { score: { red: 1, blue: 0 }, winner: "draw" };
    expect(messages(m)).toContain("vencedor incoerente com o placar");
  });

  it("exige rounds numerados 1..n", () => {
    const m = validMatch();
    m.rounds.push({ number: 3, winningTeam: "blue" });
    expect(messages(m)).toContain("rounds devem ser numerados 1..n em ordem");
  });

  it("valida condicao de vitoria contra o lado", () => {
    const m = validMatch();
    m.rounds[0] = { number: 1, winningTeam: "red", winCondition: "spike_defused" };
    expect(messages(m)).toContain("spike_defused exige attackingTeam");
    m.rounds[0] = { number: 1, winningTeam: "red", attackingTeam: "red", winCondition: "spike_defused" };
    expect(messages(m)).toContain("vencedor incoerente com spike_defused");
  });

  it("rejeita plant feito pela defesa e kill sem alvo", () => {
    const m = validMatch();
    m.rounds[0] = { number: 1, winningTeam: "red", attackingTeam: "blue" };
    m.events.push({ id: "e2", roundNumber: 1, type: "spike_plant", timeMs: 2000, actorRef: "p1" });
    m.events.push({ id: "e3", roundNumber: 1, type: "kill", timeMs: 3000, actorRef: "p1" });
    const msgs = messages(m);
    expect(msgs).toContain("spike_plant feito por quem nao esta no ataque");
    expect(msgs).toContain("kill exige targetRef");
  });

  it("rejeita evento apos o fim e assistencia do proprio alvo", () => {
    const m = validMatch();
    m.events[0] = { ...m.events[0]!, timeMs: 1_800_001, assistRefs: ["p2"] };
    const msgs = messages(m);
    expect(msgs).toContain("evento apos o fim da partida");
    expect(msgs).toContain("autor/alvo nao pode dar assistencia");
  });

  it("contadores: <= eventos quando parcial, = eventos quando completa", () => {
    const m = validMatch();
    expect(messages(m)).toEqual([]);
    expect(messages({ ...m, eventCoverage: "complete" })).toContain("kills difere dos eventos (cobertura completa)");
    m.participants[0] = { ...m.participants[0]!, kills: 0 };
    expect(messages(m)).toContain("kills menor que o total nos eventos");
  });

  it("headshotKills e dano: todos ou nenhum, e headshotKills <= kills", () => {
    const m = validMatch();
    m.participants[0] = { ...m.participants[0]!, headshotKills: 3, damageDealt: 100 };
    const msgs = messages(m);
    expect(msgs).toContain("headshotKills deve estar em todos os participantes ou em nenhum");
    expect(msgs).toContain("damageDealt deve estar em todos os participantes ou em nenhum");
    expect(msgs).toContain("headshotKills maior que kills");
  });
});

describe("Finding - evidencias e contexto (P0-02)", () => {
  const session: AnalysisSession = {
    schemaVersion: 1,
    id: "s1",
    userId: "u1",
    matchIds: ["m-1"],
    engine: "local_rules",
    createdAt: "2026-10-01T21:00:00.000Z",
  };
  const fact = (evidence: unknown[]) =>
    Finding.parse({ kind: "fact", id: "f1", sessionId: "s1", title: "t", statement: "s", evidence });

  it("hipotese nunca tem confianca 1 (nao e conclusao comprovada)", () => {
    const base = { kind: "hypothesis", id: "f2", sessionId: "s1", title: "t", statement: "s", limitations: ["x"] };
    const evidence = [{ kind: "round", matchId: "m-1", roundNumber: 1 }];
    expect(Finding.safeParse({ ...base, evidence, confidence: 1 }).success).toBe(false);
    expect(Finding.safeParse({ ...base, evidence, confidence: 0.7, sampleSize: { count: 3, unit: "rounds" } }).success).toBe(true);
    expect(Finding.safeParse({ ...base, evidence, confidence: 0.7, sampleSize: { count: 0, unit: "rounds" } }).success).toBe(false);
  });

  it("rejeita trecho de video invertido", () => {
    const evidence = [{ kind: "video", videoId: "v1", startMs: 5000, endMs: 1000 }];
    expect(Finding.safeParse({ kind: "fact", id: "f1", sessionId: "s1", title: "t", statement: "s", evidence }).success).toBe(false);
  });

  it("valida evidencias contra os dados da sessao", () => {
    const ctx = { session, matches: [Match.parse(validMatch())] };
    expect(checkFindingInContext(fact([{ kind: "event", matchId: "m-1", eventId: "e1" }]), ctx)).toEqual([]);
    const broken = fact([
      { kind: "event", matchId: "m-1", eventId: "e9" },
      { kind: "round", matchId: "m-1", roundNumber: 7 },
      { kind: "metric", matchId: "m-2", metricKey: "k", value: 1 },
      { kind: "video", videoId: "v1", startMs: 0, endMs: 10 },
    ]);
    expect(checkFindingInContext(broken, ctx)).toEqual([
      "evidence[0]: evento inexistente",
      "evidence[1]: round inexistente",
      "evidence[2]: partida fora da sessao",
      "evidence[3]: video inexistente",
    ]);
  });

  it("recomendacao so aponta para Findings existentes da mesma sessao", () => {
    const f = fact([{ kind: "event", matchId: "m-1", eventId: "e1" }]);
    const rec = CoachingRecommendation.parse({
      id: "r1", sessionId: "s1", findingIds: ["f1", "f9"], title: "t", practice: "p", priority: "low",
    });
    expect(checkRecommendationLinks(rec, [f])).toEqual(["finding f9 inexistente"]);
  });
});

describe("Video - marcacoes manuais (P0-02)", () => {
  const video = VideoReference.parse({
    id: "v1", matchId: "m-1", fileName: "partida.mp4", durationMs: 60_000, offsetMs: 2_000,
    storage: "local", importedAt: "2026-10-01T21:00:00.000Z",
  });
  const marker = {
    id: "mk1", videoId: "v1", timestampMs: 12_000, label: "Pico seco no A", roundNumber: 1,
    source: "manual", createdAt: "2026-10-01T21:05:00.000Z",
  };

  it("aceita marcacao manual e converte tempos com o offset", () => {
    const mk = VideoMarker.parse(marker);
    expect(checkVideoMarker(mk, video)).toEqual([]);
    expect(videoToMatchTimeMs(video, mk.timestampMs)).toBe(10_000);
    expect(matchToVideoTimeMs(video, 10_000)).toBe(12_000);
  });

  it("rejeita marcacao sem rotulo, automatica ou alem do fim do video", () => {
    expect(VideoMarker.safeParse({ ...marker, label: "  " }).success).toBe(false);
    expect(VideoMarker.safeParse({ ...marker, source: "auto" }).success).toBe(false);
    const late = VideoMarker.parse({ ...marker, timestampMs: 61_000 });
    expect(checkVideoMarker(late, video)).toEqual(["marcacao apos o fim do video"]);
  });
});

describe("LocalImportEnvelope (P0-02)", () => {
  const envelope = {
    kind: "cyl-local-bundle",
    schemaVersion: 1,
    createdAt: "2026-10-01T22:00:00.000Z",
    origin: "synthetic",
    matches: [validMatch()],
  };

  it("aceita envelope versionado e preenche listas vazias", () => {
    const r = LocalImportEnvelope.parse(envelope);
    expect(r.videos).toEqual([]);
    expect(r.markers).toEqual([]);
  });

  it("rejeita versao desconhecida, origem divergente e referencias quebradas", () => {
    expect(LocalImportEnvelope.safeParse({ ...envelope, schemaVersion: 2 }).success).toBe(false);
    expect(LocalImportEnvelope.safeParse({ ...envelope, origin: "user_import" }).success).toBe(false);
    const marker = { id: "mk", videoId: "v-x", timestampMs: 0, label: "x", source: "manual", createdAt: "2026-10-01T22:00:00.000Z" };
    expect(LocalImportEnvelope.safeParse({ ...envelope, markers: [marker] }).success).toBe(false);
  });
});
