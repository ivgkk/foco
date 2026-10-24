# Foco para Windows

Para configurar e publicar atualizações automáticas no instalador Windows, consulte [docs/updates.md](docs/updates.md).

Aplicativo desktop para compartilhar janelas, jogos e monitores em salas privadas. O Foco compartilha vídeo e o áudio do aplicativo escolhido; voz e conversa podem continuar no Discord.

## Firebase e contas

Esta versão já vem conectada ao projeto Firebase do Foco; quem instala o app não precisa configurar um projeto. Antes de publicar ou testar salas online, o dono do projeto deve ativar **Email/Password** em Authentication e publicar [`firebase/database.rules.json`](firebase/database.rules.json) na aba Rules do Realtime Database. As regras atuais usam vagas numeradas para aplicar o limite de participantes sem métodos não suportados pelo validador.

As contas não exigem confirmação por email nesta versão. Username é único; o apelido e o perfil podem ser alterados. Não há recuperação de senha ainda. O projeto usa o plano Firebase Spark gratuito dentro das cotas publicadas; o serviço pode deixar de aceitar operações quando uma cota é atingida. O vídeo não passa pelo Firebase.

## Usar

- Instalador Windows: `release/Foco-Setup-0.2.7.exe`
- Versão portátil: `release-performance/Foco-Portable-0.2.7.exe`
- Crie uma sala ou entre com código/link. Salas não dependem do dono estar conectado, mas pelo menos um participante precisa estar online para assistir ou transmitir.
- Escolha uma janela ou monitor e selecione o aplicativo que fornece o áudio. Cada espectador controla o volume de cada transmissão.
- Cada sala aceita até 50 pessoas, sem opção para alterar esse limite. A malha ponto a ponto mantém o vídeo fora de um servidor, mas exige upload do computador de quem transmite para cada espectador; 50 é um limite de entrada, não uma promessa de que a transmissão em grupo escale bem.

O instalador não tem assinatura digital. O Windows pode mostrar um aviso do SmartScreen.

## Desenvolver e gerar instalador

Requer Windows 10 (build 19041 ou mais novo), Node.js e pnpm.

```powershell
pnpm install
pnpm run start
pnpm run check
pnpm run dist
```

O app usa Electron, WebRTC/PeerJS e captura WASAPI por processo para o áudio exclusivo do aplicativo. A conexão de mídia é ponto a ponto. O PeerJS Cloud fornece a sinalização gratuita; STUN/TURN público pode ajudar a atravessar NAT, sem garantia de disponibilidade. Em conexão direta, os pares podem obter os endereços IP de rede uns dos outros. Compartilhe códigos somente com pessoas confiáveis.

1080p/60 é um limite escolhido, não uma garantia de qualidade nem de impacto zero no FPS. O resultado depende da GPU, jogo, encoder, rede e captura oferecida pelo Windows. Caso a rede não sustente a qualidade, reduza manualmente para 720p ou 480p. Salas de dezenas de pessoas e retransmissão resiliente exigiriam uma SFU/TURN própria, que normalmente tem custo; não fazem parte deste escopo sem orçamento.


