# Especificacoes de tela e preparacao para o design system

Este documento **nao** define identidade visual. Ele fixa os nomes de tokens, os componentes necessarios e as regras de interface para que o design system feito no Figma possa ser implementado com precisao.

## Tokens (nomes = contrato; valores atuais sao provisorios)

| Token CSS | Uso | Tailwind (web) |
|---|---|---|
| `--cyl-bg` | Fundo da aplicacao | `bg-bg` |
| `--cyl-surface` | Superficies (paineis, tabelas) | `bg-surface` |
| `--cyl-border` | Divisores e bordas | `border-border` |
| `--cyl-text` / `--cyl-text-muted` | Texto principal e secundario | `text-text` / `text-muted` |
| `--cyl-accent` / `--cyl-on-accent` | Acao primaria e destaque (violeta) e o texto sobre ela | `bg-accent`, `text-accent`, `text-on-accent` |
| `--cyl-accent-soft` / `--cyl-on-accent-soft` | Preenchimento de selecao e hover (item ativo, chips) | `bg-accent-soft`, `text-on-accent-soft` |
| `--cyl-subtle` / `--cyl-input` | Preenchimento discreto e borda de campos | `bg-subtle`, `border-input` |
| `--cyl-up` / `--cyl-down` | Tendencia positiva e negativa | `text-up`, `text-down` |
| `--cyl-skeleton` | Blocos de esqueleto (`.cyl-skeleton`); carregamento nunca usa spinner | `bg-skeleton` |
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
| Web `/` | [impl] | Header com Entrar e Criar conta, hero com exemplo sintetico (fato x hipotese), como funciona, seus dados, CTA desktop |
| Web `/entrar` | [impl] | Login por e-mail e senha (conta propria), erro generico, mensagens do retorno Riot por codigo |
| Web `/criar-conta` | [impl] | Cadastro (nome, e-mail, senha, termos) com etapas; leva ao painel com a pergunta de vinculo |
| Web `/vincular` | [impl] | Vinculo opcional da conta Riot (desativado, demonstracao, vinculada, desvincular) |
| Web `/painel` | [impl, dados sim] | Esqueleto ao carregar, pergunta "Deseja vincular?" apos o cadastro, perfil, patente, agentes, ranking entre amigos, mapas e destaques; artes oficiais em espacos marcados |
| Web `/partidas` | [impl, dados sim] | Conta vinculada, sincronizar, sair, aviso de sintetico, tabela, convite ao desktop |
| Web `/download` | [impl] | Proposta do desktop, garantias de compliance; instalador indisponivel |
| Desktop (5 areas) | [impl placeholder] | Shell com navegacao lateral (P0-01) |
