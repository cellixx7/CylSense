import {
  CoachingRecommendation,
  CONTRACTS_VERSION,
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
