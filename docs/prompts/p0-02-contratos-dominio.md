# Prompt - Claude Code CLI - P0-02 Contratos e dominio

Como usar (no Windows, na raiz do repositorio):

```powershell
git fetch origin
git checkout claude/vibrant-gauss-5lxtsf
git pull
claude
```

Depois cole o prompt abaixo na sessao do Claude Code.

---

```text
Voce esta no repositorio CYL Sense. Leia primeiro CLAUDE.md, README.md,
docs/architecture/overview.md, docs/architecture/p0-01-aceite.md,
docs/decisions/0001-stack-e-escopo-p0.md e docs/compliance/riot.md.
Siga todas as regras do CLAUDE.md (regras inegociaveis, fluxo de trabalho e
formato de relatorio). Inspecione a estrutura antes de criar arquivos.

## Etapa 0 - Fechar o P0-01 no Windows (obrigatoria antes do P0-02)

1. Rode `pnpm install`, `pnpm typecheck`, `pnpm test`.
2. Rode `pnpm --filter @cyl/desktop tauri info` e registre o resumo do ambiente.
3. Rode `pnpm build` e confirme que o instalador NSIS foi gerado em
   apps/desktop/src-tauri/target/release/bundle/nsis/ (informe nome e tamanho).
4. `pnpm dev` abre uma janela interativa: NAO fique esperando por ela.
   Peca para eu executar e confirmar se a janela abriu com a navegacao lateral.
5. Se algum passo falhar, diagnostique e corrija apenas o necessario (sem
   refatorar). Se faltar ferramenta do sistema, me diga o comando de
   instalacao em vez de tentar instalar sozinho.
6. Atualize docs/architecture/p0-01-aceite.md com uma secao "Verificacao no
   Windows (data)" e marque P0-01 como [x] no CLAUDE.md somente se build e
   janela estiverem confirmados. Faca commit.

Pare e me reporte ao fim da Etapa 0. So siga para o P0-02 com meu "ok".

## Etapa 1 - P0-02 Contratos e dominio

Objetivo: definir o modelo de dominio canonico e os contratos validados com
Zod, independentes de UI, banco e jogo especifico. Escopo SOMENTE de
contratos, tipos, validacao, fixtures sinteticas e testes. Sem SQLite (P0-03),
sem importador de arquivos (P0-04), sem calculo de metricas (P0-05), sem UI.

### Estrutura

- Criar `packages/core` (nome `@cyl/core`), TypeScript strict com as mesmas
  flags de apps/desktop/tsconfig.json (incluindo noUncheckedIndexedAccess),
  dependencia `zod`, testes com Vitest, scripts `typecheck` e `test`
  (o `pnpm -r` da raiz ja deve pega-los).
- Exportar pelo `src/index.ts`. Tipos derivados dos schemas via `z.infer`
  (fonte unica de verdade, sem duplicar interfaces a mao).
- Nao criar `packages/game-adapters` ainda; apenas deixe o dominio pronto
  para um adaptador VALORANT -> canonico (P0-04).

### Contratos minimos (ajuste nomes se encontrar algo melhor, justificando)

- Identificadores: ids string nao vazios; timestamps ISO 8601; duracoes em ms
  (inteiros >= 0). Enums fechados para `game` (por ora so "valorant"),
  resultado da partida/round, lado (ataque/defesa) etc.
- `Match`: id, game, mapa, modo, inicio, duracao, resultado, placar, origem
  dos dados (`source`: "synthetic_fixture" | "user_import"), versao do schema.
- `Player` / `PlayerMatchStats`: jogador do usuario e demais; agente, kills,
  deaths, assists, dano, headshots etc. Valores coerentes (nao negativos).
- `Round`: numero, lado, vencedor, tipo de vitoria, economia basica.
- `MatchEvent`: eventos com tempo relativo ao inicio da partida
  (kill, death, plant, defuse...) e referencia ao round.
- `Evidence`: referencia rastreavel a dados concretos (ids de match/round/
  evento, metrica e valor, ou trecho de video com offset), com descricao.
- `Finding`: id, titulo, `kind: "fact" | "hypothesis"`, `evidence` com pelo
  menos 1 item (obrigatorio, validado), confianca, tamanho de amostra,
  limitacoes declaradas. Regra: `hypothesis` deve declarar limitacao.
- `Recommendation`: o que treinar, ligada a um ou mais `Finding` por id.
- `VideoClip` (contrato apenas): arquivo MP4 local, duracao, offset em
  relacao a partida, marcacoes manuais. Sem processamento de video.
- Envelope de importacao versionado (`schemaVersion`) para permitir
  migracoes futuras.

Validacoes de consistencia via `superRefine` onde fizer sentido (ex.: evento
referencia round existente; soma de rounds bate com placar; Finding sem
evidencia e invalido). Exponha funcoes `parseX`/`safeParseX` que retornam
erros legiveis.

### Fixtures sinteticas

- Em `fixtures/valorant/`: pelo menos 1 partida sintetica valida completa e
  alguns casos invalidos (para testes negativos). Marque claramente como
  sinteticas (`source: "synthetic_fixture"` e um README curto na pasta).
- Nunca usar dados reais de jogadores nem apresentar fixture como resultado real.

### Testes

- Fixture valida passa; cada fixture invalida falha com o erro esperado.
- Finding sem evidencia falha; hypothesis sem limitacao falha.
- Inferencia de tipos compila (typecheck).

### Documentacao

- `docs/architecture/p0-02-aceite.md` no mesmo formato do p0-01-aceite.md
  (escopo, criterio de aceite, checklist, resultado da verificacao).
- ADR curta em `docs/decisions/0002-contratos-zod.md` se tomar decisoes
  relevantes (ex.: unidades de tempo, versionamento).
- Atualizar status no CLAUDE.md e a secao Status do README.

### Verificacao antes do commit

`pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build:web` sem erros.
Commits pequenos e descritivos. Push para a branch atual.

### Relatorio final

Responda no formato do CLAUDE.md: Implementado, Arquivos, Testes,
Pendencias, Proximo passo. Nao inicie o P0-03.
```
