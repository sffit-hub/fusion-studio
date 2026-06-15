VERSAO ONLINE - STUDIO FUSION

Esta pasta e uma copia separada da versao local.
A versao local continua em:
outputs/fusion-local-server

Esta versao online fica em:
outputs/fusion-online-server

ARQUIVOS IMPORTANTES
- server.mjs: sistema principal
- package.json: permite o servidor online iniciar com npm start
- render.yaml: configuracao pronta para Render
- data/db.json: banco inicial de teste
- public/assets: imagens e visual do site

ATENCAO SOBRE GRATUIDADE
O arquivo render.yaml esta preparado para teste gratuito.
Nesse modo, os cadastros podem ser perdidos quando o servidor reiniciar ou atualizar.

Para guardar dados com mais seguranca, use a configuracao render-persistente.yaml ou configure um disco/banco de dados persistente.
Esse recurso pode ser cobrado pela hospedagem.

Para teste rapido:
1. Criar conta no Render.
2. Subir esta pasta para um repositorio GitHub.
3. Criar um Web Service no Render.
4. Usar:
   Build Command: vazio
   Start Command: npm start
5. Depois de publicado, acessar os links:
   /admin
   /professor
   /alunos
   /matricula
   /presenca

Para uso real com dados de alunos, CPF, fotos e financeiro:
- usar HTTPS;
- fazer backup;
- usar armazenamento persistente;
- trocar senhas padrao;
- proteger o acesso administrativo;
- cuidar das regras de privacidade/LGPD.

LINKS APOS PUBLICAR
Se o Render gerar, por exemplo:
https://studio-fusion-online.onrender.com

Os acessos ficam:
https://studio-fusion-online.onrender.com/admin
https://studio-fusion-online.onrender.com/professor
https://studio-fusion-online.onrender.com/alunos
https://studio-fusion-online.onrender.com/matricula
https://studio-fusion-online.onrender.com/presenca

AJUSTES DA VERSAO ONLINE
- Textos da tela inicial e da presenca foram ajustados para uso online.
- O menu publico foi removido do cabecalho; aluno e professor ficam com telas isoladas.
- O menu completo permanece dentro do painel do administrador.
- O reconhecimento facial automatico agora compara no servidor e nao baixa lista publica de fotos dos alunos.
- A matricula online rejeita assinatura facial vazia ou sem qualidade.
- A presenca facial tambem valida a selfie pelo servidor.

OBSERVACAO IMPORTANTE
Alunos antigos que ainda nao possuem assinatura facial valida podem precisar ter a foto atualizada no administrador para usar reconhecimento facial online.
