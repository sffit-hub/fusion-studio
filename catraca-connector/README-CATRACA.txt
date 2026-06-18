CONECTOR LOCAL DA CATRACA - HENRY 7X

Este conector deve rodar no computador da academia, dentro da mesma rede da catraca.

Catraca identificada:
- Modelo: Henry 7x
- IP: 10.0.0.236
- Porta: 3000
- Conexao: cabo RJ45

Como funciona:
1. O painel admin do site cria um comando de liberar catraca.
2. Este conector local busca o comando no site online.
3. O conector envia o comando para a catraca dentro da rede local.
4. O resultado volta para o painel admin.

Modo atual:
- driver.mode = henry-ui
- Este modo e o caminho anterior, usado antes da tentativa com Online2.dll.
- O site cria o comando, o conector local recebe e tenta acionar pela tela/programa Henry.
- A DLL Online2.dll continua configurada no arquivo, mas nao e o caminho principal agora.
- O tempo padrao de liberacao agora e 5 segundos.

AUTOMACAO DA PORTARIA

Para iniciar tudo automaticamente:
1. Abra INSTALAR-PORTARIA-AUTOMATICA-WINDOWS.bat como administrador.
2. Ao entrar no Windows, o sistema tentara abrir o Henry7x, preparar a tela de liberacao em 5 segundos e iniciar o conector.

Para iniciar manualmente a automacao:
- Abra INICIAR-PORTARIA-AUTOMATICA.bat como administrador.

Para remover a inicializacao automatica:
- Abra REMOVER-PORTARIA-AUTOMATICA-WINDOWS.bat.

Para testar:
1. Abra config.json.
2. Confirme serverUrl e token.
3. Dê dois cliques em INICIAR-CONECTOR-CATRACA.bat.
4. No painel admin, abra um aluno ativo e clique em Liberar catraca.

OPCOES DE LIBERACAO

1. Liberacao pelo aluno logado
- O aluno entra na pagina dele.
- Clica em Liberar catraca agora.
- O sistema permite apenas 1 vez por dia.
- A janela de liberacao enviada ao conector e de 5 segundos.

2. Liberacao por biometria no computador
- Abra INICIAR-CONECTOR-CATRACA.bat e deixe aberto.
- Para teste, abra BIOMETRIA-MANUAL-TESTE.bat.
- Digite CPF, matricula, numero do cartao ou nome completo.
- O site verifica se o aluno esta ativo, em dia e nao bloqueado.
- Se estiver liberado, cria o comando para o conector abrir a catraca.

O arquivo BIOMETRIA-MANUAL-TESTE.bat e temporario para testar a regra.
Depois podemos trocar pelo leitor biometrico real instalado no computador.

Para liberar fisicamente:
- Hoje o modo principal voltou a ser henry-ui, usando a tela/programa Henry7x.
- O modo online2-dll fica como plano reserva, usando C:\PROSISTEMAS\SCA\Online2.dll.
- Para liberar sem depender da tela do Henry aberta, precisamos do comando hexadecimal oficial da Henry 7x Card II firmware 7105.
- Quando o comando TCP ou SDK for confirmado, mudar driver.mode para tcp-raw ou program.

Modos suportados:
- dry-run: teste seguro, nao abre a catraca.
- tcp-raw: envia bytes em hexadecimal para 10.0.0.236:3000.
- program: chama um programa local com argumentos configurados.
- henry-ui: usa a janela "Liberacao de Catraca" do programa Henry7x.
- online2-dll: chama C:\PROSISTEMAS\SCA\Online2.dll por C:\Node32\node.exe.

INFORMACAO PARA O SUPORTE HENRY

Linguagem do nosso sistema:
- JavaScript / Node.js no conector local.

Primeiro objetivo:
- Liberar o giro/acionar o rele remotamente pela rede TCP/IP.

Segundo objetivo:
- Depois receber eventos de leitura/acesso em tempo real, se o protocolo permitir.

Dados da catraca:
- Henry 7x Card II
- Firmware 7105
- IP 10.0.0.236
- Porta 3000

Pedir ao suporte:
- SDK, DLL ou Manual de Integracao/Protocolo TCP-IP.
- Comando de liberacao do rele/catraca em hexadecimal.
- Como calcular checksum do frame.
- Se existe Web Server/API interna para liberar giro por HTTP.

Importante:
Nao desligue o SCA sem confirmar, porque ele ja controla a catraca hoje.
O ideal e testar primeiro fora do horario de movimento.
