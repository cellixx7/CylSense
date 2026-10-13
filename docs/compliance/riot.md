# Compliance - Riot Games / VALORANT

## Permitido hoje

- Importar JSON/fixtures **sinteticos** e arquivos de video fornecidos pelo proprio usuario.
- Sincronizar eventos e video com ajustes e marcacoes manuais.
- Configurar opcionalmente a pasta de instalacao do VALORANT no desktop, apenas para localizar arquivos que o proprio usuario pode abrir. Isso nao substitui a API oficial.

## Proibido

- Ler a memoria do jogo.
- Contornar o Vanguard.
- Acessar tokens, credenciais, protocolos privados ou dados internos do cliente do jogo.
- Usar endpoints privados ou nao autorizados.
- Dar assistencia tatica ou qualquer vantagem competitiva em tempo real.
- Embutir segredos ou chaves no bundle desktop ou web.
- Simular autenticacao Riot em producao (a API recusa `CYL_AUTH_MODE=mock` com `NODE_ENV=production`).

## Requisitos oficiais (conferidos em 2026-10-13 em developer.riotgames.com/docs/valorant)

- Apps de VALORANT precisam do opt-in do jogador para compartilhar dados pessoais, obtido via **Riot Sign On (RSO)** por fluxo OAuth.
- O RSO so esta disponivel para quem tem **Production API Key**. A chave e solicitada no portal de desenvolvedor; se aprovada, a Riot entra em contato para iniciar a integracao RSO.
- "Personal Key Applications are currently not supported." Apps privados, de uso pessoal, nao sao aprovados.
- Uma chave por produto. A chave nao pode ser embutida em codigo, especialmente em binarios distribuidos.
- Monetizacao exige produto registrado e aprovado, um nivel gratuito para jogadores e nenhuma funcao de aposta.

## Estado da integracao no codigo

- `services/api/src/providers/riot.ts`: provedores Riot **desativados**, sem URLs, sem escopos e sem chamadas de rede.
- Endpoints, escopos e o formato do payload serao definidos somente a partir da documentacao entregue pela Riot apos a aprovacao. Nao inferir nada a partir das fixtures sinteticas.

## Proximos passos para habilitar (fora do escopo atual)

1. Registrar o produto e solicitar a Production API Key.
2. Obter a aprovacao e a documentacao de RSO da Riot.
3. Implementar `RiotAuthProvider` e `RiotMatchProvider`, mais o adaptador do payload oficial, com testes de contrato.
4. Persistencia segura (PostgreSQL, tokens cifrados) antes de qualquer uso real.

## Referencias oficiais

- https://developer.riotgames.com/docs/valorant
- https://developer.riotgames.com/policies/general
- https://support.riotgames.com/pt-br/valorant/gameplay/replays-faq-pro-tips/
- https://support.riotgames.com/en-us/riot/performance/game-memory-access-removed-for-third-party-apps
