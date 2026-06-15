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
- driver.mode = dry-run
- Neste modo ele NAO aciona fisicamente a catraca.
- Ele apenas confirma que recebeu o comando.

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
- A janela de liberacao enviada ao conector e de 10 segundos.

2. Liberacao por biometria no computador
- Abra INICIAR-CONECTOR-CATRACA.bat e deixe aberto.
- Para teste, abra BIOMETRIA-MANUAL-TESTE.bat.
- Digite CPF, matricula, numero do cartao ou nome completo.
- O site verifica se o aluno esta ativo, em dia e nao bloqueado.
- Se estiver liberado, cria o comando para o conector abrir a catraca.

O arquivo BIOMETRIA-MANUAL-TESTE.bat e temporario para testar a regra.
Depois podemos trocar pelo leitor biometrico real instalado no computador.

Para liberar fisicamente:
- Precisamos configurar o comando correto da Henry 7x.
- Quando o comando TCP ou SDK for confirmado, mudar driver.mode para tcp-raw ou program.

Modos suportados:
- dry-run: teste seguro, nao abre a catraca.
- tcp-raw: envia bytes em hexadecimal para 10.0.0.236:3000.
- program: chama um programa local com argumentos configurados.

Importante:
Nao desligue o SCA sem confirmar, porque ele ja controla a catraca hoje.
O ideal e testar primeiro fora do horario de movimento.
