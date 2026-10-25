# Fase 9B — arquitetura e validação

## Fontes de verdade e composição

O Electron carrega `renderer/index.html`, que inclui, nessa ordem, os estilos `tokens.css`, `styles.css` e `updates.css`; o script de idioma, PeerJS, `firebase-client.bundle.js` e `app.bundle.js`. O CSP continua em `index.html`. O renderer usa as fachadas existentes `window.focoDesktop`, `window.focoCloud` e `window.focoI18n`; o app não instala outro objeto global de serviços nem outro bootstrap.

`renderer/app.js` é a entrada e composição do aplicativo. Ela cria o estado da página, fornece dependências concretas aos módulos e registra os eventos do DOM. Ainda contém autenticação, perfil, moderação, diálogos e preferências de UI, que compartilham o ciclo de vida da página. O esbuild produz um único IIFE clássico em `renderer/app.bundle.js`, carregado por `file://`. O `app.js` fonte não é carregado diretamente pelo HTML. Não existe ciclo de imports entre os módulos extraídos.

| Módulo | Responsabilidade e recursos próprios |
| --- | --- |
| `renderer/cloud/context.js` | Configuração Firebase, usuário atual, caminhos RTDB e fila ordenada por sala/UID. |
| `renderer/cloud/auth.js` | Auth e perfil. |
| `renderer/cloud/rooms.js` | Sala, presença, reserva de vagas, autorização de Peer, permissões, observadores e saída condicional. |
| `renderer/cloud/chat.js` | Mensagens e anexos da sala. |
| `renderer/firebase-client.js` | Composição dos módulos Cloud e fachada `window.focoCloud`, sem alterar seus métodos públicos. |
| `renderer/app/session.js` | Identidade de autenticação/sala, gerações, validade da tentativa, Peer atual, reconexão, entrada, saída e cleanup. |
| `renderer/app/rooms.js` | Observadores de sala, presença e chat, confirmação da entrada/reentrada e sincronização de participantes. Recebe as guardas do coordenador de sessão. |
| `renderer/app/capture.js` | Tentativa de compartilhamento, stream local, tracks, AudioContext/Worklet, token WASAPI, cancelamento e parada idempotente. |
| `renderer/app/p2p.js` | Conexões de dados, chamadas PeerJS, autorização, retries, streams remotos e métricas WebRTC. |
| `renderer/app/stage.js` | Tiles persistentes, vídeo, estado visual de mídia, qualidade apresentada, layout, foco e fullscreen. Consome estado de conexão/métricas do módulo P2P. |
| `renderer/app/chat.js` | Renderização incremental, composer, anexos, emojis, avatar e não lidas. |
| `renderer/app/ui.js` | Lista de salas e participantes, suas linhas persistentes e menu contextual. |

Os módulos recebem portas concretas para as interações entre responsabilidades. Não existe camada genérica de transporte ou estado. O `state` da página ainda contém dados compartilhados para evitar alteração de comportamento, mas recursos de captura e timers internos da sessão passaram a ter proprietários explícitos. As guardas de validade da sessão são fornecidas por `session.js`; `rooms.js` e `p2p.js` consultam essas guardas antes de aceitar callbacks atrasados ou conceder mídia.

## Ciclos de vida e contratos

1. A resposta inicial do Auth libera o startup. Troca de UID incrementa a geração, encerra observadores da conta anterior, limpa apresentação privada e inicia a lista da nova conta.
2. Entrar numa sala cria uma tentativa com UID, código, Peer e gerações. Abrir a sinalização inicia `joinRoom`; apenas a tentativa ainda válida aceita o resultado. Presença e observadores são associados à sala. Na saída, os listeners, chamadas, conexões, timers e compartilhamento são encerrados; o `exitRoom` remoto usa Peer ID esperado. Entrada antiga é compensada sem apagar uma presença nova do mesmo Peer ID.
3. `capture.js` cria vídeo primeiro e inicia áudio de aplicativo somente quando solicitado. A tentativa verifica cancelamento antes de publicar. A parada fecha tracks, Worklet, contexto, listener e token nativo; o modo apenas vídeo não inicia WASAPI.
4. `p2p.js` verifica a identidade da sala e o registro Firebase do Peer remoto antes de enviar mídia, responder chamadas ou aceitar comandos. Revogação remove conexões e streams. `stage.js` reaproveita o mesmo nó `<video>` e `srcObject` quando a disposição da interface muda.
5. `preload.cjs` mantém a bridge `focoDesktop` e os mesmos canais IPC. `main.cjs` continua proprietário do processo nativo e do resolver de PID, pois ambos dependem diretamente do `webContents`, da origem confiável e do fechamento da janela. Com cerca de 240 linhas e cleanup comum, a extração isolada aumentaria as passagens de identidade e token pela fronteira nativa sem simplificar seu ciclo de vida. Esta foi a decisão do Lote 8.

O schema e as regras em `firebase/database.rules.json` permanecem inalterados. O projeto mantém a limitação conhecida: o vínculo entre identidade Firebase e PeerJS não é criptográfico. A verificação de registro/sala/UID/Peer ID/geração reduz concessões indevidas, mas não resolve essa limitação.

## Comandos

```powershell
npm install --no-package-lock
npm run bundle:firebase
npm run bundle:app
npm run check
npm run start
```

`prestart` e `predist*` geram ambos os bundles; `npm run check` compara seus bytes com as fontes e valida sintaxe, seletores, CSP, IPC e contratos Cloud offline. Para empacotar sem publicar, defina `FOCO_OUTPUT_DIR` para um diretório temporário e execute `npm run dist:dir`. `dist:publish` publica e não integra a validação local.

No desenvolvimento, o watcher aplica CSS sem recarregar a página, reconstrói o bundle alterado quando `app.js`, `app/*`, `firebase-client.js` ou `cloud/*` muda e só então solicita reload. Bundles gerados não são observados, evitando loop. Alterações em `main.cjs` ainda exigem reinício manual. `electron/dev-tools.cjs` não entra no pacote.

Os testes Electron criam cópias do renderer e dos assets em diretórios temporários, com stubs para Firebase, Desktop e PeerJS. Os perfis são isolados e os diretórios são removidos ao sair, inclusive após erro. A cópia dos assets preserva também o logo nas capturas visuais. `test:cloud` usa SDK Firebase simulado e cobre a fachada real. `test:session` ainda inclui três trechos importados por marcadores textuais do Cloud para conservar seus cenários de ordenação/snapshot/saída condicional; essa dívida de fixture não altera a cobertura e pode migrar para um harness único de SDK simulado posteriormente. Bindings de funções internas no bundle existem apenas para páginas de fixture `-smoke.html` ou `-fixture.html`; a página de produção não os ativa.

## Organização e limites

Os arquivos `app.js`, `index.html` e `styles.css` na raiz formam um protótipo separado: `electron/main.cjs` aponta para `renderer/index.html`, e o builder inclui `electron/`, `renderer/`, `assets/`, dependências necessárias e `package.json`. Eles foram mantidos sem movimentação para preservar qualquer uso independente. A ordem e a cascade CSS não mudaram. Fontes, licenças, ícones, AudioWorklet, PowerShell e módulo `.node` continuam nas posições exigidas pelo pacote.

Os testes sintéticos não comprovam WASAPI real em um processo de jogo, comunicação entre dois computadores, NAT/TURN, Firebase de produção ou atualização publicada. Esses testes exigem uma sessão manual controlada fora desta refatoração; nenhuma credencial real ou janela autenticada foi usada aqui.

## Registro dos nove lotes

| Lote | Mudança e checkpoint |
| --- | --- |
| 1 | Scripts internos passaram para npm, bundles têm checagem de frescor, watcher recursivo e pacote local inspecionado. Baseline de IPC e suites Electron registrado antes das extrações. |
| 2 | Fixtures passaram para diretórios temporários; cenários existentes permaneceram. O acoplamento textual residual de `test:session` está descrito acima. |
| 3 | Cliente Firebase dividido em contexto, Auth, salas e chat; fachada, RTDB e bundle preservados; contrato offline e regressões de sessão/P2P/salas passaram. |
| 4 | Coordenador de sessão e fluxo de sala separados; concorrência, presença, reentrada e callbacks antigos validados. |
| 5 | Captura recebeu propriedade de tracks, áudio e token; cenários com/sem áudio, cancelamento e IPC passaram. |
| 6 | PeerJS e autorização isolados; P2P, streams, sessão e compartilhamento passaram. |
| 7 | Stage, chat e listas de UI separados, bundle clássico introduzido, testes de geometria, vídeo persistente, fullscreen, painel e shell passaram. |
| 8 | Extração do main dispensada após análise do ciclo de vida nativo; IPC, áudio e empacotamento devem ser confirmados na matriz final. |
| 9 | Protótipo da raiz mantido e identificado, CSS mantido para preservar cascade, documentação e matriz final adicionadas. |

## Validação final

Todas as suítes abaixo passaram em série em 25/10/2026. Tempos são aproximados, em segundos; a matriz inclui a execução repetida após restaurar os assets das fixtures. A linha de base anterior às extrações também passou, com as mesmas contagens principais. Não houve regressão crítica persistente.

Durante a extração, falhas de fixture apontaram bindings ausentes para `WIDE_PANEL_QUERY`, um nome de arquivo `-fixture.html` e uma quebra de linha que ocultava `connectRoom` do harness. Esses três pontos foram corrigidos sem mudar as assertions. Uma execução de fullscreen falhou uma vez após a extração de sessão e passou na repetição isolada e na matriz final. A ausência de `assets/` na cópia temporária quebrava apenas o logo das capturas; o helper passou a copiá-los e todas as suítes visuais foram repetidas.

| Comando | Resultado | Tempo aproximado |
| --- | --- | ---: |
| `npm run prestart` | Bundles Firebase e app gerados com npm | 3 s |
| `npm run check` | Sintaxe, 138 seletores, CSP, regras, bundles, 24 casos de origem IPC e contrato Cloud offline | 3 s |
| `npm run test:p2p-auth` | 38 cenários adversariais | 6 s |
| `npm run test:session` | 49 cenários de concorrência e cleanup | 1 s |
| `npm run test:rooms` | 15 cenários, 26 capturas | 5 s |
| `npm run test:share` | 43 cenários, 23 capturas | 9 s |
| `npm run test:streams` | 46 cenários, inclusive loopback WebRTC | 14 s |
| `npm run test:stage` | 25 estados visuais | 12 s |
| `npm run test:fullscreen` | Foco, teclado, identidade DOM e cleanup | 3 s |
| `npm run test:audio-ipc` | Propriedade, token, parada duplicada, erro, quit e resolver | <1 s |
| `npm run test:shell` | 50 cenários | 15 s |
| `npm run test:panel` | 49 cenários, 20 capturas | 7 s |
| `npm run test:secondary` | 50 cenários e capturas de diálogos | 8 s |
| `npm run test:i18n` | 32 assertions em quatro idiomas | 1 s |
| `npm run test:ipc` | 24 casos de origem confiável | <1 s |
| `npm run test:cloud` | Fachada real com SDK e RTDB simulados | <1 s |

As capturas sintéticas cobrem 980×720, 1280×800, 1440×960, 1920×1032 e janela maximizada, além de login, home, Stage com 0/1/2/3+ streams, grade, foco, fullscreen, compartilhamento, chat, participantes, perfil, configurações, modais e quatro idiomas. A geometria do Stage final reproduziu a linha de base anotada: 876×588 em 980×720, 672×668 em 1280×800, 832×828 em 1440×960 e 1312×900 em 1920×1032. Após corrigir o fixture para incluir `assets/`, as capturas foram refeitas e o logo voltou a carregar. Não foi feita comparação automática pixel a pixel, pois os arquivos originais de capturas foram sobrescritos pelas suítes; a avaliação usa geometria, invariantes DOM/vídeo e inspeção das capturas atuais. O CSS não foi alterado pela Fase 9B.

`npm run dist:dir` concluiu em cerca de 10 s com saída em `%TEMP%/foco-phase9b-final-package/win-unpacked`, sem publicar. O ASAR contém HTML, os dois bundles com bytes iguais aos arquivos fonte gerados, os três CSS, idioma, AudioWorklet, fontes/licenças, main, preload, ícone, PeerJS e loopback-capture. `resolve-process.ps1` e o módulo nativo Win32 x64 estão em `app.asar.unpacked`; `electron/dev-tools.cjs` não está no pacote. O builder detectou o `pnpm-lock.yaml`, tentou `pnpm list`, registrou a ausência do comando e concluiu usando sua varredura interna de `node_modules`. Esse aviso não impediu o build e não existe chamada direta a pnpm nos scripts npm do projeto. O pacote contém também um prebuild Linux da dependência nativa, sem uso no Windows.

O executável empacotado não foi aberto: `main.cjs` registra o protocolo `foco:` ao iniciar e solicita instância única, o que poderia interferir no ambiente já autenticado. `npm run prestart`, os testes Electron em perfis temporários e a inspeção do ASAR são a evidência de inicialização disponível sem afetar a sessão real. Também não houve teste de WASAPI real, Firebase de produção, dois computadores, TURN/NAT ou atualização publicada. Não houve commit, push, deploy, publicação nem alteração de infraestrutura.

Arquivos criados nesta fase: `renderer/app/*`, `renderer/cloud/*`, `renderer/app.bundle.js`, os scripts de build/checagem/fixture/contrato Cloud e este documento. Arquivos modificados nesta fase: `renderer/app.js`, `renderer/firebase-client.js`, seu bundle, `renderer/index.html`, `electron/dev-tools.cjs`, `package.json`, `scripts/publish-release.cjs`, `scripts/validate-project.cjs`, fixtures Electron, `README.md` e `docs/updates.md`. Nenhum arquivo foi movido. Modificações locais anteriores em `electron/main.cjs`, `electron/preload.cjs`, `renderer/styles.css`, testes de áudio/fullscreen e `docs/phase-8b-lot-4.md` foram preservadas.
