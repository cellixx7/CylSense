# ADR 0005 - Arquivos do usuario: dialogo e leitura no Rust, importacao atomica

- Status: aceita
- Data: 2026-10-14
- Relacionadas: [ADR 0004](0004-sqlite-local-e-postgresql-no-backend.md), [importacao de partidas](../architecture/match-import.md)

## Contexto

O P0-04 precisa ler um JSON escolhido pelo usuario; o P0-07 fara o mesmo com MP4. No Tauri 2 o caminho comum e dar ao WebView os plugins `dialog` e `fs` com escopos. Isso permite que qualquer codigo no front-end peca leituras de caminhos dentro do escopo, e o escopo tende a crescer.

## Decisao

1. **O front-end nunca envia caminhos de arquivo.** Um comando Rust especifico por caso (`import_pick_file`) abre o dialogo nativo (`tauri-plugin-dialog`, chamado so pelo Rust), aplica as regras do caso (extensao, tamanho maximo com teto fixo, codificacao) e devolve apenas o necessario (nome sem diretorio + conteudo), ou `null` se o usuario cancelar.
2. **Sem `tauri-plugin-fs` e sem permissoes `dialog:*` na capability.** A capability da janela continua `core:default`.
3. **Erros sem caminho e sem conteudo**, como os do armazenamento (ADR 0004).
4. **Importacao atomica**: um arquivo e validado por inteiro e gravado numa unica transacao (`match_save_batch`); se algo falhar, nada e gravado.

## Consequencias

- Superficie menor: o WebView so le o arquivo que o usuario escolheu, no momento em que escolheu.
- Cada novo tipo de arquivo exige um comando Rust proprio (ex.: video no P0-07 guardara o caminho no Rust e nao precisara devolver o conteudo).
- O teto de tamanho fica no Rust; o front-end pode pedir um limite menor, nunca maior.
- Arrastar e soltar arquivos no WebView nao e suportado por enquanto (exigiria outro mecanismo e outra revisao).
