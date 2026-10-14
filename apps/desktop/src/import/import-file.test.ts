import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOCAL_IMPORT_KIND, type Match } from "@cyl/contracts";
import { memoryStore } from "@/test/memory-store";
import { commitImport, DEFAULT_IMPORT_LIMITS, planImport, type ImportPlan, type PickedFile } from "./import-file";
import { createFilePicker, toImportFileError } from "./picker";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "../../fixtures/valorant", name), "utf8");

function file(content: string, name = "partida.json"): PickedFile {
  return { name, sizeBytes: new TextEncoder().encode(content).length, content };
}

let seq = 0;
const newId = () => `local-${++seq}`;

function plan(content: string, name?: string): ImportPlan {
  const r = planImport(file(content, name), { newId });
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

function planError(content: string, options: Parameters<typeof planImport>[1] = {}, name?: string) {
  const r = planImport(file(content, name), { newId, ...options });
  if (r.ok) throw new Error("deveria falhar");
  return r.error;
}

function bundle(matches: Match[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    kind: LOCAL_IMPORT_KIND,
    schemaVersion: 1,
    createdAt: "2026-10-14T10:00:00.000Z",
    origin: "synthetic",
    matches,
    ...extra,
  });
}

const syn1 = () => plan(fixture("syn-0001.json")).matches[0] as Match;
const syn2 = () => plan(fixture("syn-0002.json")).matches[0] as Match;

describe("planImport: arquivo valido", () => {
  it("normaliza a fixture sintetica e marca a origem como synthetic", () => {
    const p = plan(fixture("syn-0001.json"), "syn-0001.json");
    expect(p).toMatchObject({ fileName: "syn-0001.json", format: "cyl-synthetic-valorant", origin: "synthetic" });
    expect(p.matches).toHaveLength(1);
    expect(p.matches[0]).toMatchObject({ externalId: "syn-0001", origin: "synthetic", map: "Ascent" });
  });

  it("dados ausentes continuam ausentes (syn-0002 sem headshots, dano e assistencias)", () => {
    const m = syn2();
    for (const p of m.participants) {
      expect(p).not.toHaveProperty("headshotKills");
      expect(p).not.toHaveProperty("damageDealt");
    }
  });

  it("aceita pacote local e gera ids locais novos sem tocar no externalId", () => {
    const original = syn1();
    const p = plan(bundle([original]));
    expect(p.format).toBe(LOCAL_IMPORT_KIND);
    expect(p.matches[0]?.externalId).toBe("syn-0001");
    expect(p.matches[0]?.id).not.toBe(original.id);
  });

  it("aceita extensao em maiusculas", () => {
    expect(plan(fixture("syn-0001.json"), "SYN.JSON").matches).toHaveLength(1);
  });
});

describe("planImport: entradas recusadas", () => {
  it("JSON invalido, sem repetir o conteudo do arquivo na mensagem", () => {
    const e = planError('{"segredo": "token-XYZ", quebrado');
    expect(e.code).toBe("invalid_json");
    expect(e.message).not.toMatch(/segredo|token-XYZ/);
  });

  it("extensao nao suportada", () => {
    expect(planError(fixture("syn-0001.json"), {}, "partida.txt").code).toBe("unsupported_file");
  });

  it("arquivo maior que o limite (tamanho declarado e conteudo)", () => {
    const content = fixture("syn-0001.json");
    const limits = { ...DEFAULT_IMPORT_LIMITS, maxBytes: 1024 };
    expect(planError(content, { limits })).toMatchObject({ code: "too_large", message: "arquivo maior que o limite de 1 KB" });
    // tamanho informado menor que o real nao engana a checagem
    const r = planImport({ name: "a.json", sizeBytes: 10, content }, { limits, newId });
    expect(r.ok || r.error.code).toBe("too_large");
  });

  it("raiz que nao e objeto e formato desconhecido", () => {
    expect(planError("[]").code).toBe("unsupported_format");
    expect(planError("42").code).toBe("unsupported_format");
    const e = planError(fixture("invalid/unknown-format.json"));
    expect(e.code).toBe("unsupported_format");
    expect(e.message).toContain("cyl-synthetic-valorant v1");
  });

  it("versao de formato e schemaVersion incompativeis", () => {
    const raw = JSON.parse(fixture("syn-0001.json")) as Record<string, unknown>;
    expect(planError(JSON.stringify({ ...raw, formatVersion: 2 })).code).toBe("incompatible_version");
    expect(planError(bundle([syn1()], { schemaVersion: 2 })).code).toBe("incompatible_version");
  });

  it.each([
    "invalid/score-mismatch.json",
    "invalid/counters-below-events.json",
    "invalid/defuse-without-plant.json",
    "invalid/win-condition-mismatch.json",
  ])("fixture inconsistente %s", (name) => {
    expect(planError(fixture(name)).code).toBe("invalid_data");
  });

  it("estrutura incompativel: campos obrigatorios ausentes", () => {
    const raw = JSON.parse(fixture("syn-0001.json")) as Record<string, unknown>;
    delete raw.matchId;
    const e = planError(JSON.stringify(raw));
    expect(e.code).toBe("invalid_data");
    expect(e.message).toContain("matchId");
  });

  it("arquivo nao pode se passar por resposta oficial da Riot", () => {
    const riot = { ...syn1(), origin: "riot_api" as const };
    expect(planError(bundle([riot], { origin: "riot_api" })).code).toBe("invalid_origin");
    // origem da partida diferente da declarada no pacote
    expect(planError(bundle([riot])).code).toBe("invalid_data");
  });

  it("pacote vazio, com partida repetida, acima do limite ou com videos", () => {
    expect(planError(bundle([])).code).toBe("invalid_data");
    const m = syn1();
    expect(planError(bundle([m, { ...m, id: "outro" }])).code).toBe("duplicate_in_file");
    const limits = { ...DEFAULT_IMPORT_LIMITS, maxMatches: 1 };
    expect(planError(bundle([syn1(), syn2()]), { limits }).code).toBe("too_many_matches");
    const video = { id: "v1", matchId: m.id, fileName: "a.mp4", durationMs: 1000, offsetMs: 0, storage: "local", importedAt: "2026-10-14T10:00:00.000Z" };
    expect(planError(bundle([m], { videos: [video] })).code).toBe("unsupported_format");
  });
});

describe("commitImport", () => {
  it("grava, e a reimportacao nao duplica", async () => {
    const { store, rows } = memoryStore();
    const first = await commitImport(store, plan(fixture("syn-0001.json")));
    expect(first.ok && first.value.counts).toEqual({ inserted: 1, unchanged: 0, updated: 0 });

    const again = await commitImport(store, plan(fixture("syn-0001.json")));
    expect(again.ok && again.value.counts).toEqual({ inserted: 0, unchanged: 1, updated: 0 });
    expect(again.ok && again.value.items[0]?.id).toBe(first.ok && first.value.items[0]?.id);
    expect(rows.size).toBe(1);

    const list = await store.listMatches();
    expect(list.ok && list.value.map((m) => m.externalId)).toEqual(["syn-0001"]);
  });

  it("pacote com varias partidas grava todas de uma vez", async () => {
    const { store, rows } = memoryStore();
    const r = await commitImport(store, plan(bundle([syn1(), syn2()])));
    expect(r.ok && r.value.counts.inserted).toBe(2);
    expect(rows.size).toBe(2);
  });

  it("falha do banco devolve erro explicito e nada e gravado", async () => {
    const { store, rows, failWith } = memoryStore();
    failWith({ code: "write_failed", message: "falha ao gravar a partida (ReadOnly)" });
    const r = await commitImport(store, plan(fixture("syn-0001.json")));
    expect(r).toEqual({
      ok: false,
      error: { code: "storage", storageCode: "write_failed", message: "nada foi gravado: falha ao gravar a partida (ReadOnly)" },
    });
    expect(rows.size).toBe(0);
  });
});

describe("seletor nativo (ponte com import_pick_file)", () => {
  it("envia so o limite, nunca um caminho, e devolve o arquivo", async () => {
    const calls: unknown[] = [];
    const pick = createFilePicker(async (command, args) => {
      calls.push({ command, args });
      return { name: "a.json", sizeBytes: 2, content: "{}" };
    });
    expect(await pick(1024)).toEqual({ ok: true, value: { name: "a.json", sizeBytes: 2, content: "{}" } });
    expect(calls).toEqual([{ command: "import_pick_file", args: { maxBytes: 1024 } }]);
  });

  it("cancelamento vira null", async () => {
    expect(await createFilePicker(async () => null)(1)).toEqual({ ok: true, value: null });
  });

  it("erros nativos conhecidos sao repassados; o resto vira erro generico", async () => {
    const denied = await createFilePicker(async () => {
      throw { code: "permission_denied", message: "sem permissao para ler o arquivo" };
    })(1);
    expect(denied).toEqual({ ok: false, error: { code: "permission_denied", message: "sem permissao para ler o arquivo" } });
    expect(toImportFileError(new Error("C:\\Users\\alguem\\segredo.json"))).toEqual({
      code: "read_failed",
      message: "nao foi possivel ler o arquivo",
    });
    expect(toImportFileError({ code: "storage", message: "x" }).code).toBe("read_failed");
    const malformed = await createFilePicker(async () => ({ name: 1 }))(1);
    expect(malformed.ok || malformed.error.code).toBe("read_failed");
  });
});
