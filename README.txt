Fusion Combat Fit - versao para rede local

Como usar:
1. Abra a pasta fusion-local-server.
2. De dois cliques em INICIAR-SERVIDOR.bat.
3. Na janela que abrir, veja o endereco "No Wi-Fi", algo como http://192.168.0.10:8080.
4. Os alunos, professores e administrador acessam esse endereco pelo navegador, conectados no mesmo Wi-Fi.
5. Mantenha a janela aberta enquanto o site estiver sendo usado.

Senhas e acessos:
- Alunos novos: cada aluno usa a senha individual definida no cadastro pelo administrador.
- Alunos antigos migrados: senha inicial no formato aluno + matricula. Exemplo: matricula 00001 usa aluno00001.
- Professores antigos migrados: senha inicial no formato professor + numero. Exemplo: Professor 01 usa professor01.
- Professores novos: senha criada no cadastro pelo administrador.
- Administrador principal: usuario admin / senha admin2026.
- Novos administradores: usuario e senha criados pelo administrador.

Dados:
- Tudo fica salvo em data/db.json no computador que esta rodando o servidor.
- As alteracoes feitas por professores e administrador aparecem para todos os aparelhos da rede local.
- Nao precisa de internet para funcionar.

Links de acesso:
- Matricula online: http://SEU-IP:8080/matricula
- Alunos: http://SEU-IP:8080/alunos
- Professores: http://SEU-IP:8080/professor
- Administrador: http://SEU-IP:8080/admin
- Presenca facial: http://SEU-IP:8080/presenca
- As telas de aluno, professor e presenca sao exclusivas, sem menu visual para outras areas. O acesso geral fica apenas para o administrador.

Novidades desta versao:
- Foi criada a pagina /matricula para matricula online.
- Na matricula online, o aluno preenche nome, CPF, data de nascimento, telefone, endereco, objetivo, escolhe o plano desejado e cria a propria senha.
- A data de nascimento agora e digitada direto no formato dd/mm/aaaa, sem precisar buscar o ano no calendario.
- Ao digitar a data de nascimento, a idade e calculada automaticamente na caixa Idade.
- A matricula online exige foto no momento do cadastro. A pagina tenta abrir a camera ao vivo e tambem oferece a opcao Tirar foto pelo celular.
- O botao Enviar matricula so fica liberado depois que o aluno escolhe um plano.
- O cadastro enviado pela matricula online entra no painel do administrador como Aguardando ativacao, bloqueado ate o administrador conferir e ativar.
- Para ativar uma matricula online, o administrador precisa efetivar o pagamento no Caixa. Ao lancar o pagamento, o aluno e ativado, o proximo vencimento e calculado automaticamente para o periodo seguinte do plano e a entrada fica registrada no financeiro.
- O sistema impede cadastro sem CPF e impede CPF duplicado. Se ja existir CPF cadastrado, a tela orienta entrar em contato no WhatsApp com a frase recuperar senha.
- O sistema tambem bloqueia novo cadastro quando a foto enviada tiver caracteristicas faciais muito parecidas com outro aluno ja cadastrado.
- Para cadastros antigos participarem dessa comparacao facial, atualize/salve a foto do aluno no administrador uma vez nesta nova versao.
- O administrador cadastra novos alunos e professores.
- O cadastro de aluno no administrador agora tem blocos no modelo de sistema de academia: Dados cadastrais, Adicionais, Horario, Acesso e Plano/professor.
- Campos incluidos: matricula, endereco, bairro, CEP, cidade, UF, telefone, celular, sexo, CPF, identidade, e-mail, nascimento, idade, situacao, debito, observacoes, exame medico, avaliacao fisica, objetivo, profissao, estado civil, empresa, responsaveis, regras de horario, cartao de acesso e senha de acesso.
- Cada aluno tem sua propria senha de acesso, criada pelo administrador no cadastro.
- Cada professor tem sua propria senha e pode trocar a propria senha dentro da area do professor.
- Ao atualizar a pagina do aluno ou do professor no mesmo navegador, o sistema permanece na area acessada e nao volta para a tela de login.
- As areas do aluno e do professor agora tem botao Sair, limpando a sessao salva no navegador.
- Administradores podem trocar a propria senha e criar novos administradores.
- O sistema agora tem controle de presenca por reconhecimento facial no celular em /presenca. O aluno informa nome completo ou CPF, tira a selfie e o sistema compara com a foto cadastrada antes de liberar ou negar a presenca.
- O painel do administrador mostra as ultimas presencas registradas e a frequencia/ultima entrada do aluno sao atualizadas automaticamente.
- A tela /alunos agora permite acesso do aluno apenas por reconhecimento facial: o aluno tira a selfie, sem senha, CPF ou nome completo, e entra direto se a foto conferir com uma foto cadastrada.
- O reconhecimento facial automatico agora exige similaridade alta e diferenca clara entre o melhor cadastro e os demais, para evitar abrir sempre o mesmo aluno quando a foto nao confere com seguranca.
- Se o reconhecimento facial negar, refaca a foto com rosto centralizado, boa luz e foto de cadastro bem enquadrada.
- Alunos bloqueados, inativos ou excluidos nao conseguem acessar a area do aluno, reconhecimento facial, busca ou registro de presenca.
- Ao excluir um aluno, ele vai para a lista de Excluidos e fica automaticamente bloqueado, sem apagar o historico do cadastro.
- Professores e administradores ainda podem ser bloqueados/desbloqueados pelo administrador.
- O administrador pode bloquear/desbloquear alunos, professores e outros administradores.
- O administrador pode clicar em Editar em qualquer aluno ja cadastrado e alterar todos os dados: dados cadastrais, adicionais, horario, acesso, plano, professor, vencimento e bloqueio.
- A lista de alunos no administrador e compacta; novo cadastro e edicao abrem em uma aba lateral. Ao salvar, a aba fecha e aparece a mensagem Cadastro salvo ou Alteracao salva.
- A lista de alunos no administrador agora mostra apenas os nomes. Ao clicar no nome, abre a janela de cadastro/alteracao do aluno.
- A aba Alunos do administrador agora tem tres listas separadas: Ativos, Inativos e Excluidos.
- O cadastro/edicao do aluno tem o campo Status do aluno: Ativo, Inativo ou Excluido.
- O cadastro de professor agora tem dados completos: foto, nome, senha, endereco, telefone, celular, e-mail, CPF, identidade, nascimento e cadastro do CREF.
- A lista de professores tambem abre em janela ao clicar no nome. Ao salvar, bloquear ou excluir, a janela fecha e o painel atualiza.
- O administrador agora tem um painel exclusivo da academia, com visual de sistema de gestao, barra de modulos, resumo financeiro e areas separadas para Alunos, Financeiro, Usuarios, Acessos e Relatorios.
- O aluno agora tem um painel totalmente diferente, com visual de aplicativo para celular, mostrando vencimento, plano, frequencia, treino, avaliacao e dados de acesso em blocos simples de ler.
- O menu do administrador agora tem a opcao Caixa.
- O Caixa mostra a origem de cada entrada: mensalidade, matricula ou produto vendido.
- Produtos podem ser cadastrados com nome, valor e estoque, e vendidos pelo Caixa.
- Ao lancar mensalidade, o sistema calcula automaticamente o proximo vencimento/bloqueio usando a data de vencimento anterior do aluno e o tipo do plano.
- Agora existem botoes de excluir para alunos, professores, administradores, planos, produtos e entradas do Caixa.
- O administrador cadastra planos com valor: mensal, pre-pago, trimestral, semestral, diarista e anual.
- Formas de pagamento: dinheiro, pix, cartao de debito e cartao de credito.
- A area de pagamentos registra o mes pago, valor, forma de pagamento e proximo vencimento.
- Ao informar pagamento do mes, o aluno fica com pagamento em dia e acesso desbloqueado.
- A tela do administrador mostra uma soma dos valores recebidos por forma de pagamento.
- A pagina do aluno e aberta dinamicamente pelo cadastro, sem precisar criar 500 arquivos.
- A busca do aluno e discreta: so retorna resultado quando digitar o nome completo ou CPF cadastrado.
- O professor registra avaliacao fisica completa: peso, medidas, pressao, frequencia cardiaca, objetivo, restricoes, anamnese e observacoes.
- Na avaliacao fisica do professor, o IMC e calculado automaticamente quando preencher peso e altura. Se precisar, o professor tambem pode digitar o IMC manualmente.
- A avaliacao aparece para o aluno em formato legivel e nao editavel.
- O professor monta a rotina de treino usando uma galeria offline de exercicios com imagem, series, repeticoes, peso, descanso e anotacoes.
- A rotina segue o padrao Treino A, Treino B, Treino C: cada treino tem titulo, descricao e uma faixa horizontal de imagens que o aluno rola para o lado no celular.
- Na area do aluno, cada treino aparece em uma moldura de slide menor e mais pratica: o aluno rola as imagens para o lado pela barra dentro da moldura.
- A galeria do professor agora mostra os exercicios separados por grupo muscular: Peito, Costa, Triceps, Biceps, Antebraco, Trapesio, Quadriceps, Gluteo, Abdomem e Cardio.
- As fotos colocadas em public/assets/exercises dentro das pastas de grupo muscular sao importadas automaticamente para a galeria.
- Foram importadas 402 novas fotos de exercicios, ficando 422 exercicios/imagens cadastrados no total.
- Na area do professor, cada exercicio da galeria tem um botao Adicionar. O duplo clique/toque foi removido para evitar zoom no celular.
- A montagem do treino pelo professor agora usa um formulario simples: escolha o grupo muscular, escolha o exercicio, preencha series/repeticoes/peso/descanso e clique em Adicionar. Nao existe mais galeria nem lista de imagens na area do professor.
- Os botoes foram aumentados e o sistema bloqueia duplo toque/gesto de zoom no navegador para evitar aproximacao involuntaria no celular.
- Na edicao do professor, os exercicios adicionados ao treino agora aparecem em tabela compacta sem imagem grande, com campos para series, repeticoes, peso, descanso, anotacoes e remover. As imagens ficam apenas para o aluno.
- Depois que os exercicios estiverem no treino, o professor pode editar series, repeticoes, peso, descanso e anotacoes direto em cada imagem do treino antes de salvar.
- Para facilitar o trabalho do professor, os grupos musculares da galeria ficam recolhidos. Clique em Peito, Biceps, Costa etc. para abrir as fotos, e clique novamente para esconder.
- Os treinos A, B, C, D e E tambem ficam recolhidos; clique no nome do treino para abrir ou esconder os exercicios.
- O cadastro do aluno agora aceita foto. A foto aparece para o administrador, para o professor e para o aluno.
- As imagens dos exercicios ficam em public/assets/exercises e os nomes ficam no banco data/db.json.

Observacao:
Se o Windows bloquear o acesso de outros aparelhos, permita o Node.js no Firewall do Windows para redes privadas.
