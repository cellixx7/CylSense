# Dados pessoais e retencao

Levantamento de riscos da v0.2. Nao substitui uma avaliacao juridica (LGPD/GDPR), que e pre-requisito para producao.

| Dado | Onde | Risco | Controle atual | Pendente para producao |
|---|---|---|---|---|
| Identidade da conta (nome#tag, id externo) | API (memoria) | Identifica o jogador | Separacao por usuario na sessao; apagado ao desvincular | Persistencia com controle de acesso; politica de privacidade |
| Tokens do provedor | API (memoria) | Acesso a conta Riot | So servidor; nunca em respostas nem logs | Cifrar em repouso; rotacao; revogacao remota real |
| Sessao | Cookie httpOnly + API | Sequestro de sessao | `SameSite=Lax`, `Secure` em producao, TTL de 7 dias, logout | Rotacao de sessao; invalidar sessoes ao revogar |
| Historico de partidas | API (memoria) e desktop (SQLite, P0-03) | Perfil comportamental; contem nomes de outros jogadores | Apagado ao desvincular a conta | Prazo de retencao definido; exportacao e exclusao total da conta; minimizar dados de terceiros |
| Videos | Somente desktop | Podem conter voz, chat e tela | Nunca enviados; o contrato guarda so o nome do arquivo | Consentimento explicito antes de qualquer envio para IA |
| Logs | stdout da API | Vazamento de credenciais | Sem query string, sem cookies ou autorizacao (testado) | Retencao de logs; nao registrar ids externos em excesso |

## Principios

- Coletar so o necessario. O desktop funciona sem conta.
- Revogacao = parar de sincronizar **e** apagar os dados derivados daquela conta.
- IA externa somente com consentimento explicito, por envio, e somente das evidencias selecionadas.
- Dados sinteticos sempre rotulados (`origin: "synthetic"`).
