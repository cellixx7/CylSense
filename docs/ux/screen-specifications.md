# Especificacoes de tela e preparacao para o design system

Este documento **nao** define identidade visual. Ele fixa os nomes de tokens, os componentes necessarios e as regras de interface para que o design system feito no Figma possa ser implementado com precisao.

## Tokens (nomes = contrato; valores atuais sao provisorios)

| Token CSS | Uso | Tailwind (web) |
|---|---|---|
| `--cyl-bg` | Fundo da aplicacao | `bg-bg` |
| `--cyl-surface` | Superficies (paineis, tabelas) | `bg-surface` |
| `--cyl-border` | Divisores e bordas | `border-border` |
| `--cyl-text` / `--cyl-text-muted` | Texto principal e secundario | `text-text` / `text-muted` |
| `--cyl-accent` | Acao primaria e destaque | `bg-accent`, `text-accent` |
| `--cyl-warning` | Avisos (dados sinteticos, amostra pequena) | `border-warning` |
| `--cyl-danger` | Erros | `border-danger` |
| `--cyl-radius` | Raio padrao (pequeno; evitar cards muito arredondados) | `rounded-cyl` |

Definidos em `apps/web/app/globals.css`. O desktop usa as variaveis do shadcn (`apps/desktop/src/index.css`); ao aplicar o design system, as duas apps passam a ler os mesmos tokens (candidato a `packages/ui` ou `packages/tokens`). Faltam definir no Figma: tipografia (escala, numeros tabulares), espacamento, elevacao, cores de time e de resultado (vitoria/derrota) e escalas para graficos.

## Componentes necessarios

| Componente | Onde | Requisitos |
|---|---|---|
| Tabela densa de partidas | Web e desktop | Numeros tabulares, ordenavel, coluna de origem |
| Selo de origem/aviso | Web e desktop | Obrigatorio quando `origin = synthetic` |
| Indicador de metrica | Desktop, web futuro | Valor, unidade, tamanho da amostra e aviso de amostra pequena |
| Card de Finding | Desktop | Distingue visualmente **fato** e **hipotese**; hipotese mostra confianca e limitacoes; link para cada evidencia |
| Recomendacao | Desktop | Ligada aos Findings de origem; prioridade |
| Timeline de partida | Desktop | Rounds, eventos e marcadores de video sincronizados |
| Player de video | Desktop | Ajuste de offset, saltos por evento |
| Estados vazios, carregando e erro | Todos | Texto especifico (ver interaction-flows, fluxo 8) |

## Regras de interface

- Densidade informacional alta e hierarquia clara (referencias conceituais: Linear, Blitz, Leetify, Outplayed; nao copiar).
- Evitar gradientes roxos decorativos, cards arredondados por padrao, chatbot ocupando a area principal e elementos sem funcao.
- Nenhum numero sem contexto: toda metrica exibe a amostra.
- Hipoteses nunca usam a mesma apresentacao de fatos.
- Acessibilidade: contraste AA, navegacao por teclado, `aria-current` na navegacao (ja aplicado no desktop), alertas com `role="alert"`.

## Telas atuais

| Tela | Estado | Conteudo |
|---|---|---|
| Web `/` | [impl] | Proposta, CTA conectar, CTA desktop, tres pilares |
| Web `/entrar` | [impl] | Status do login (desativado ou demonstracao), mensagens de erro por codigo |
| Web `/partidas` | [impl, dados sim] | Conta vinculada, sincronizar, sair, aviso de sintetico, tabela, convite ao desktop |
| Web `/download` | [impl] | Proposta do desktop, garantias de compliance; instalador indisponivel |
| Desktop (5 areas) | [impl placeholder] | Shell com navegacao lateral (P0-01) |
