# Atualizações do Foco para Windows

O instalador NSIS por usuário usa `electron-updater`. Quando o aplicativo é instalado com uma versão que já contém o atualizador, ele consulta o feed ao abrir, baixa uma nova versão em segundo plano e a instala ao encerrar normalmente. O app não força uma reinicialização durante uma transmissão. Builds locais sem feed configurado não fazem atualização automática.

## Hospedagem sem mensalidade

Use o repositório público `ivgkk/foco-updates` apenas para os releases binários. O código-fonte pode permanecer privado em outro lugar. Clientes precisam baixar publicamente o `latest.yml`, o instalador e o `.blockmap`; nenhum token do GitHub deve ser incluído no app.

## Publicar uma versão

1. Incremente `version` em `package.json` antes de cada release. O primeiro instalador público com feed está configurado como `0.2.1` para ser mais novo que os builds de teste `0.2.0`.
2. Defina `GH_TOKEN` somente no ambiente local de publicação. O projeto já aponta por padrão para `ivgkk/foco-updates`. O token precisa de permissão para criar releases nesse repositório e não deve ser salvo no projeto.
3. Execute `npm run dist:publish`. O builder gera o NSIS e envia o instalador e metadados a um release em rascunho.
4. Confirme que o rascunho contém o instalador `.exe`, o `.blockmap` e `latest.yml`, então publique-o na página do GitHub Releases. O app só encontra releases publicados.

O próximo build de teste é `0.2.7`; depois de publicá-lo, instalações anteriores com o atualizador devem detectar a nova versão, baixar em segundo plano e deixar a instalação pronta para a próxima saída normal do app.

A primeira versão com atualizador precisa ser instalada manualmente uma vez nos computadores que ainda usam versões anteriores. Depois dessa instalação inicial, novas versões chegam pelo app.


