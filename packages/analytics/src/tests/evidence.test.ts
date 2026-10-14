import { checkFindingInContext, type AnalysisSession, type Evidence, type Finding } from "@cyl/contracts";
import { buildEvidenceIndex, checkEvidence, checkFinding, metricEvidence } from "../evidence/evidence";
import { analyzeMatch } from "../metrics/match-metrics";
import { analyzeSession } from "../sessions/session";
import { buildMatch, fixture } from "./builders";

const m1 = fixture("syn-0001.json");
const m2 = fixture("syn-0002.json");
const a1 = analyzeMatch(m1, "p1");
const a2 = analyzeMatch(m2, "p1");
if (!a1.ok || !a2.ok) throw new Error("fixture invalida");
const index = buildEvidenceIndex("s1", [
  { match: m1, analysis: a1.value },
  { match: m2, analysis: a2.value },
]);

describe("evidencias", () => {
  it.each<[string, Evidence]>([
    ["metrica com o valor calculado", { kind: "metric", matchId: m1.id, metricKey: "kd_ratio", value: 3 }],
    ["evento existente", { kind: "event", matchId: m1.id, eventId: "syn-0001:r1:e0" }],
    ["rodada existente", { kind: "round", matchId: m2.id, roundNumber: 2 }],
  ])("aceita %s", (_, e) => {
    expect(checkEvidence(e, index)).toBeNull();
  });

  it.each<[string, Evidence, RegExp]>([
    ["partida fora da analise", { kind: "round", matchId: "outra", roundNumber: 1 }, /partida fora/],
    ["evento inexistente", { kind: "event", matchId: m1.id, eventId: "syn-0001:r9:e0" }, /evento inexistente/],
    ["evento de outra partida", { kind: "event", matchId: m2.id, eventId: "syn-0001:r1:e0" }, /evento inexistente/],
    ["rodada inexistente", { kind: "round", matchId: m1.id, roundNumber: 4 }, /rodada inexistente/],
    ["metrica desconhecida", { kind: "metric", matchId: m1.id, metricKey: "acs", value: 200 }, /desconhecida/],
    ["metrica indisponivel", { kind: "metric", matchId: m2.id, metricKey: "damage_dealt", value: 0 }, /indisponivel/],
    ["valor diferente do calculado", { kind: "metric", matchId: m1.id, metricKey: "kd_ratio", value: 2 }, /valor diferente/],
    ["video (fora do motor)", { kind: "video", videoId: "v1", startMs: 0, endMs: 10 }, /video/],
    ["malformada", { kind: "round", matchId: m1.id, roundNumber: 0 }, /malformada/],
  ])("recusa %s", (_, e, message) => {
    expect(checkEvidence(e, index)).toMatch(message);
  });

  it("metricEvidence leva o valor calculado e recusa metrica indisponivel", () => {
    expect(metricEvidence(a1.value, "headshot_kill_ratio")).toEqual({
      kind: "metric",
      matchId: m1.id,
      metricKey: "headshot_kill_ratio",
      value: 2 / 3,
    });
    expect(() => metricEvidence(a2.value, "damage_dealt")).toThrow(/indisponivel/);
  });

  it("checkFinding valida sessao, contrato e cada evidencia", () => {
    const f: Finding = {
      kind: "fact",
      id: "f1",
      sessionId: "outra-sessao",
      title: "t",
      statement: "s",
      evidence: [{ kind: "event", matchId: m1.id, eventId: "nao-existe" }],
      sampleSize: { count: 3, unit: "matches" },
    };
    expect(checkFinding(f, index)).toEqual([
      "finding de outra sessao",
      "evidence[0]: evento inexistente na partida",
      "sampleSize maior que as partidas analisadas",
    ]);
    expect(checkFinding({ ...f, evidence: [] } as unknown as Finding, index)[0]).toMatch(/malformado/);
  });

  it("findings gerados pelo motor tambem passam no validador dos contratos", () => {
    const matches = Array.from({ length: 2 }, (_, i) =>
      buildMatch({
        id: `side-${i}`,
        startedAt: `2026-10-0${i + 1}T20:00:00.000Z`,
        rounds: Array.from({ length: 24 }, (_, r) => ({
          winner: r < 12 ? (r < 3 ? "red" : "blue") : r < 22 ? "red" : "blue",
          attackers: r < 12 ? "red" : "blue",
        })),
      }),
    );
    const s = analyzeSession("s-ctx", matches.map((match) => ({ match, playerRef: "p1" })));
    if (!s.ok) throw new Error(s.error.message);
    expect(s.value.findings.length).toBeGreaterThan(0);
    const session: AnalysisSession = {
      schemaVersion: 1,
      id: "s-ctx",
      userId: "local",
      matchIds: matches.map((m) => m.id),
      engine: "local_rules",
      createdAt: "2026-10-14T12:00:00.000Z",
    };
    for (const f of s.value.findings) expect(checkFindingInContext(f, { session, matches })).toEqual([]);
  });
});
