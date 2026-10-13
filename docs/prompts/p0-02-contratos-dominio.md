# Prompt - Claude Code CLI - P0-02 Contratos e dominio (arquitetura v0.2)

Contexto: o P0-01 esta concluido (verificado no Windows) e a fundacao v0.2 ja criou
`@cyl/contracts`, `@cyl/core`, `@cyl/game-adapter-valorant` e as fixtures sinteticas
(ver docs/architecture/v0.2-estado-e-migracao.md). Este prompt fecha o P0-02 sobre
essa base; ele **nao** recria pacotes nem estruturas da v0.1.

Como usar (no Windows, na raiz do repositorio):

```powershell
git fetch origin
git checkout claude/vibrant-gauss-5lxtsf
git pull --ff-only
claude
```

Depois cole o prompt abaixo na sessao do Claude Code.

---

```text
Voce esta no repositorio CYL Sense (arquitetura v0.2: apps/web, apps/desktop,
services/api e pacotes compartilhados). Leia primeiro CLAUDE.md,
docs/roadmap.md, docs/architecture/overview.md,
docs/architecture/v0.2-estado-e-migracao.md,
docs/decisions/0002-separacao-web-desktop-api.md e docs/compliance/riot.md.
Siga todas as regras do CLAUDE.md (regras inegociaveis, fluxo de trabalho e
formato de relatorio). Inspecione packages/contracts, packages/core e
packages/game-adapters/valorant antes de alterar qualquer arquivo.

## Objetivo

Concluir o P0-02: deixar o modelo de dominio completo para o desktop
local-first e conectar o desktop aos contratos compartilhados. Escopo
SOMENTE de contratos, tipos, validacao, fixtures sinteticas, testes e a
ligacao minima do desktop. Sem SQLite (P0-03), sem importador de arquivos
do usuario (P0-04), sem calculo de metricas (P0-05), sem telas novas
(P0-06), sem login Riot real.

## Regras desta tarefa

- NAO criar novamente packages/core, packages/contracts ou o adaptador
  VALORANT: eles ja existem. Evoluir os arquivos existentes.
- Os contratos ficam em @cyl/contracts (Zod, tipos via z.infer, fonte unica
  de verdade). Portas e Result ficam em @cyl/core. Normalizacao de dados de
  jogo fica em packages/game-adapters/valorant.
- Manter os nomes ja publicados: `origin` ("synthetic" | "riot_api" |
  "user_import"), `CoachingRecommendation`, `VideoReference`, `Finding`
  com `kind: "fact" | "hypothesis"`, `Evidence` como union discriminada.
  Renomear exige justificativa e ADR.
- Mudanca compativel (campo opcional novo) => incrementar MINOR de
  CONTRACTS_VERSION. Mudanca incompativel => MAJOR + ADR + manter o schema
  anterior enquanto houver consumidor. A API e o web dependem destes
  contratos: rode os testes deles tambem.
- Nunca usar dados reais nem inventar campos ou formatos da Riot API.
  Fixtures continuam no formato sintetico `cyl-synthetic-valorant`.
- Proxima ADR livre: 0003.

## Lacunas a avaliar e, se pertinente, implementar

1. Match/Round: lado (ataque/defesa) por round e por time, tipo de vitoria
   do round, placar final coerente com os rounds (superRefine).
2. MatchParticipant: dano, headshots e outros contadores nao negativos que
   o motor de analytics do P0-05 vai precisar. Somente campos que as
   fixtures sinteticas possam fornecer de forma coerente.
3. Economia basica por round (opcional; se entrar, documentar a unidade).
4. Finding: tamanho de amostra declarado (sampleSize) alem de confidence e
   limitations, e regra de que a evidencia referencia dados existentes da
   sessao quando validada em contexto.
5. VideoReference: marcacoes manuais (timestamp + rotulo) como contrato,
   sem processamento de video.
6. Envelope de importacao versionado para arquivos locais (schemaVersion),
   preparando migracoes do P0-03/P0-04.
7. Funcoes parseX/safeParseX com mensagens de erro legiveis, reaproveitando
   o padrao Result de @cyl/core.

## Fixtures sinteticas

- Atualizar fixtures/valorant/ para cobrir os campos novos.
- Adicionar casos invalidos para testes negativos (em
  fixtures/valorant/invalid/ ou inline nos testes) e manter o README da
  pasta deixando claro que tudo e sintetico.

## Ligacao com o desktop

- Adicionar @cyl/contracts (e @cyl/game-adapter-valorant se necessario)
  como dependencia de apps/desktop.
- Um teste no desktop que normaliza uma fixture e valida contra Match,
  provando que o bundler do desktop (Vite) consome os pacotes TS-fonte.
- Nao exibir dados de partidas na UI ainda (o teste "nao exibe dados de
  partidas" do App deve continuar valido ate o P0-06).

## Testes

- Fixtures validas passam; cada invalida falha com o erro esperado.
- Finding sem evidencia falha; hypothesis sem limitacao falha.
- Testes existentes de contracts, core, valorant, api, web e desktop
  continuam passando.

## Documentacao

- docs/architecture/p0-02-aceite.md no formato do p0-01-aceite.md
  (escopo, criterio de aceite, checklist, resultado da verificacao).
- ADR 0003 somente se houver decisao relevante (ex.: unidades, versionamento).
- Atualizar o status em CLAUDE.md, docs/roadmap.md e na secao Status do README.

## Verificacao antes do commit

pnpm install, pnpm typecheck, pnpm test, pnpm build:web e pnpm build:site sem
erros. Commits pequenos e descritivos. Push normal para a branch atual (sem
force).

## Relatorio final

Responda no formato do CLAUDE.md: Implementado, Arquivos, Testes,
Pendencias, Proximo passo. Nao inicie o P0-03.
```
