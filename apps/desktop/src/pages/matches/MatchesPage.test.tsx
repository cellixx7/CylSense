import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { err, ok } from "@cyl/core";
import type { ImportError, PickedFile } from "@/import/import-file";
import type { PickFile } from "@/import/picker";
import { memoryStore } from "@/test/memory-store";
import { MatchesPage } from "./MatchesPage";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "../../fixtures/valorant", name), "utf8");
const picked = (name: string, content = fixture(name)): PickedFile => ({ name, sizeBytes: content.length, content });

/** Seletor que devolve, em ordem, as respostas dadas. */
function picker(...answers: (PickedFile | null | ImportError)[]): PickFile {
  return async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error("seletor chamado mais vezes que o esperado");
    return next !== null && "code" in next ? err(next) : ok(next);
  };
}

function setup(pick: PickFile, mem = memoryStore()) {
  const onDataChanged = vi.fn();
  render(<MatchesPage store={mem.store} pickFile={pick} onDataChanged={onDataChanged} />);
  return { ...mem, onDataChanged };
}

async function importVia(fileName: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
  fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
  await screen.findByText(/Arquivo valido/);
  fireEvent.click(screen.getByRole("button", { name: /^Importar 1 partida$/ }));
  await screen.findByText(fileName === "dup" ? /ja tinha sido importado/ : /Importacao concluida/);
}

describe("Partidas: historico", () => {
  it("mostra carregamento e depois o estado vazio", async () => {
    setup(picker());
    expect(screen.getByRole("status")).toHaveTextContent("Carregando partidas");
    expect(await screen.findByText("Nenhuma partida importada ainda.")).toBeInTheDocument();
  });

  it("mostra erro do banco e permite tentar de novo", async () => {
    const mem = memoryStore();
    mem.failWith({ code: "unavailable", message: "armazenamento local indisponivel" });
    setup(picker(), mem);
    expect(await screen.findByRole("alert")).toHaveTextContent("armazenamento local indisponivel");
    mem.failWith(null);
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma partida importada ainda.")).toBeInTheDocument();
  });

  it("fora do app desktop explica que o historico e local", () => {
    render(<MatchesPage store={null} pickFile={null} />);
    expect(screen.getByText(/somente no aplicativo desktop/)).toBeInTheDocument();
  });
});

describe("Partidas: importacao", () => {
  it("valida, mostra a previa, grava e atualiza o historico", async () => {
    const { rows, onDataChanged } = setup(picker(picked("syn-0001.json")));
    await importVia("syn-0001.json");
    expect(screen.getByText(/1 nova · 0 ja importadas · 0 atualizadas/)).toBeInTheDocument();
    expect(onDataChanged).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Voltar ao historico" })[0]!);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("syn-0001")).toBeInTheDocument();
    expect(within(table).getByText("Sintetico")).toBeInTheDocument();
    expect(within(table).getByText(/Vermelho 2 x 1 Azul/)).toBeInTheDocument();
  });

  it("a previa identifica dados sinteticos antes de gravar", async () => {
    const { rows } = setup(picker(picked("syn-0001.json")));
    fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
    expect(await screen.findByText(/Dados sinteticos/)).toBeInTheDocument();
    expect(rows.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Escolher arquivo JSON" })).toBeInTheDocument();
    expect(rows.size).toBe(0);
  });

  it("importar de novo nao duplica", async () => {
    const { rows } = setup(picker(picked("syn-0001.json"), picked("syn-0001.json")));
    await importVia("syn-0001.json");
    fireEvent.click(screen.getByRole("button", { name: "Importar outro arquivo" }));
    await screen.findByText(/Arquivo valido/);
    fireEvent.click(screen.getByRole("button", { name: /^Importar 1 partida$/ }));
    expect(await screen.findByText(/ja tinha sido importado/)).toBeInTheDocument();
    expect(rows.size).toBe(1);
  });

  it("arquivo invalido e recusado sem gravar e sem expor o conteudo", async () => {
    const content = '{"token": "SEGREDO-123", ';
    const { rows, onDataChanged } = setup(picker(picked("ruim.json", content)));
    fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Arquivo recusado");
    expect(alert).toHaveTextContent("O arquivo nao contem JSON valido.");
    expect(alert).toHaveTextContent("Nenhuma partida foi gravada.");
    expect(document.body).not.toHaveTextContent("SEGREDO-123");
    expect(rows.size).toBe(0);
    expect(onDataChanged).not.toHaveBeenCalled();
  });

  it("partida inconsistente e recusada", async () => {
    setup(picker(picked("score-mismatch.json", fixture("invalid/score-mismatch.json"))));
    fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Partida inconsistente: result.score: placar diferente dos rounds/);
  });

  it("erro de permissao vindo do lado nativo", async () => {
    setup(picker({ code: "permission_denied", message: "sem permissao para ler o arquivo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissao para ler o arquivo.");
  });

  it("cancelar o dialogo volta ao estado inicial", async () => {
    setup(picker(null));
    fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
    expect(await screen.findByRole("button", { name: "Escolher arquivo JSON" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falha do banco ao gravar e explicita", async () => {
    const mem = memoryStore();
    setup(picker(picked("syn-0001.json")), mem);
    fireEvent.click(await screen.findByRole("button", { name: "Importar partida" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher arquivo JSON" }));
    await screen.findByText(/Arquivo valido/);
    mem.failWith({ code: "write_failed", message: "falha ao gravar a partida (ReadOnly)" });
    fireEvent.click(screen.getByRole("button", { name: /^Importar 1 partida$/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falha ao gravar no banco local");
    expect(alert).toHaveTextContent("Nada foi gravado: falha ao gravar a partida (ReadOnly).");
  });
});

describe("Partidas: detalhe", () => {
  it("mostra informacoes, times, rodadas, eventos e cobertura", async () => {
    setup(picker(picked("syn-0001.json")));
    await importVia("syn-0001.json");
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Ascent · competitive");
    expect(screen.getByText(/Dados sinteticos/)).toBeInTheDocument();
    expect(screen.getByText("Time Vermelho")).toBeInTheDocument();
    expect(screen.getAllByText("Synth Alpha").length).toBeGreaterThan(1);
    expect(screen.getAllByRole("columnheader", { name: "Abates com headshot" })).toHaveLength(2);
    expect(screen.getByText("cobertura parcial")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rodadas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument();
  });

  it("dados ausentes aparecem como nao informados, sem colunas inventadas", async () => {
    setup(picker(picked("syn-0002.json")));
    await importVia("syn-0002.json");
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await screen.findByText("Time Vermelho");
    expect(screen.queryByRole("columnheader", { name: "Abates com headshot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Dano" })).not.toBeInTheDocument();
    const coverage = screen.getByRole("region", { name: "Cobertura dos dados" });
    expect(within(coverage).getByText(/Dano/)).toHaveTextContent("Dano: nao informado");
  });

  it("partida inexistente", async () => {
    const mem = memoryStore();
    const { MatchDetail } = await import("./MatchDetail");
    render(<MatchDetail store={mem.store} id="nao-existe" onBack={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Partida nao encontrada");
  });
});
