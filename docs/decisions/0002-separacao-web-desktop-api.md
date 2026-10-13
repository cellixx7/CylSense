# ADR 0002 - Separacao Web, Desktop e API

- Status: aceita
- Data: 2026-10-13
- Substitui parcialmente: [ADR 0001](0001-stack-e-escopo-p0.md) (itens "monolito somente desktop" e "sem backend")

## Contexto

O produto passa a ter uma porta de entrada web (conhecer o CYL Sense, conectar a conta Riot, ver historico e diagnosticos iniciais) que leva ao desktop, onde fica a analise aprofundada. O Riot Sign On exige um backend: o client secret e os tokens nao podem ficar no navegador nem no binario desktop, e a propria Riot proibe chaves embutidas em binarios distribuidos.

## Decisao

1. **Tres produtos em um monorepo pnpm**: `apps/web`, `apps/desktop` e `services/api`.
2. **Contratos compartilhados** em `@cyl/contracts` (Zod, versionados). Web e desktop usam o mesmo modelo de dominio; a API valida o que entra e o web valida o que recebe.
3. **Portas no `@cyl/core`** (`AuthProvider`, `MatchProvider`, `GameAdapter`, `MatchNormalizer`), com implementacoes por jogo em `packages/game-adapters/*`.
4. **Web em Next.js (App Router)**: renderizacao estatica para as paginas institucionais (SEO) e componentes cliente para as areas autenticadas. O web encaminha `/api/*` para a API (mesma origem), entao o cookie de sessao e httpOnly e dispensa CORS.
5. **API em Fastify + Zod**, com estado em memoria por enquanto e PostgreSQL no futuro.
6. **Integracao Riot desativada por padrao**. O modo `mock` existe so para desenvolvimento e demonstracao e e recusado em producao.
7. **Desktop continua local-first**: funciona offline, com SQLite e videos locais. A sincronizacao com a API e opcional e futura.

## Alternativas consideradas

- **Web em Vite SPA**: tooling igual ao do desktop e mais leve, mas sem SEO adequado para a landing sem prerender, e sem camada de servidor no proprio web.
- **Backend dentro do Next (route handlers)**: um deploy a menos, porem acoplaria a sincronizacao (que o desktop tambem usara) ao site. A API separada atende web e desktop igualmente.
- **Pacote `ui` compartilhado agora**: adiado. O desktop usa Vite/shadcn e o web usa Next; compartilhar componentes antes do design system geraria retrabalho. Os tokens ja sao nomeados de forma comum (ver `docs/ux/screen-specifications.md`).

## Consequencias

- Mais dependencias (Next, Fastify), isoladas por workspace. Os scripts do desktop (`dev`, `dev:web`, `build`, `build:web`) foram mantidos e os novos tem nomes proprios (`dev:site`, `dev:api`, `dev:demo`, `build:site`).
- O desenvolvimento continua sem credenciais e sem servicos pagos.
- `Node >= 22.9` (necessario para `--env-file-if-exists`; o Node 20 ja esta fora de suporte).
- O backlog P0 do desktop segue valido; o P0-02 (contratos e dominio) foi parcialmente antecipado.
