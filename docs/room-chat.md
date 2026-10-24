# Chat por sala

O chat usa o Firebase Realtime Database já configurado no Foco. Não usa Firebase Storage: imagens e GIFs são guardados como anexos pequenos no próprio Realtime Database, para evitar exigir outro produto/forma de cobrança.

- Texto, emojis nativos e GIFs animados são aceitos.
- Imagens estáticas são redimensionadas e comprimidas pelo cliente.
- O anexo final pode ter até 160 KB; o limite de entrada para imagem estática é 8 MB. GIFs acima de 160 KB precisam ser reduzidos antes do envio.
- O app carrega as 50 mensagens mais recentes e remove mensagens com mais de 30 dias quando alguém abre o chat daquela sala.
- As mensagens guardam uma miniatura reduzida da foto e da cor do perfil do remetente.
- Só membros autenticados que estejam na sala leem e enviam mensagens. Cada pessoa só pode excluir as próprias mensagens.

Salas aceitam até 50 pessoas. Esse é um teto fixo de entrada, não uma garantia de qualidade para vídeo em grupo: transmissões WebRTC P2P exigem upload do transmissor para cada espectador.

## Publicar as regras necessárias

Depois de atualizar o Firebase bundle e instalar esta versão, publique o conteúdo completo de `firebase/database.rules.json` no Firebase Console: **Realtime Database → Regras → editar/substituir as regras → Publicar**. O arquivo inclui as permissões para `roomChats`; sem publicar essas regras, o chat pode aparecer mas as mensagens serão recusadas com `Permission denied`.

O arquivo atual preserva as regras de login, perfil e salas e acrescenta leitura apenas para membros presentes na sala, criação autenticada de mensagens, exclusão própria e o índice de data usado para buscar as mensagens recentes e limpar as antigas.
