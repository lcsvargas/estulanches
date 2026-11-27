# Roteiro do video - EstuLanches (3 a 4 minutos)

Use a tela gravada e sua propria narracao. O roteiro e uma base; mostre os comandos e a interface funcionando no seu computador antes de afirmar que a implantacao foi validada.

## 0:00 - 0:25 | Apresentacao e problema

"Oi, eu sou [seu nome] e este e o EstuLanches, um sistema para organizar o cardapio e os pedidos de uma cantina escolar. O problema que ele resolve e a concentracao de pedidos no intervalo, que pode gerar fila, anotacoes manuais e dificuldade para a equipe acompanhar o que precisa preparar. Com o sistema, o estudante consulta o cardapio e envia o pedido pela web, enquanto a cantina acompanha tudo em um painel."

## 0:25 - 0:55 | Tecnologias e arquitetura

"O frontend foi feito com HTML, CSS e JavaScript puro. No servidor usei Node.js com Express para criar a API REST. Os dados ficam no PostgreSQL. Escolhi essa arquitetura porque e simples de manter e demonstrar: a mesma aplicacao entrega a interface e disponibiliza os endpoints, e o banco fica separado em outro container."

Mostre rapidamente a estrutura de pastas: `public`, `src`, `migrations`, `tests`, `Dockerfile` e `docker-compose.yml`.

## 0:55 - 1:25 | Dockerfile e Compose

"O Dockerfile cria a imagem da aplicacao usando Node 22 Alpine. A etapa de producao instala apenas dependencias necessarias, copia o codigo e executa com o usuario sem privilegios `node`. Tambem existe uma etapa separada para testes. No docker-compose, o servico `db` executa PostgreSQL e o servico `app` executa a API. O `depends_on` com `service_healthy` evita iniciar a aplicacao antes de o banco responder. O volume `postgres_data` preserva os dados mesmo quando os containers sao recriados."

Mostre os blocos `FROM`, `USER`, `HEALTHCHECK` no Dockerfile e os servicos `db` e `app` no Compose.

## 1:25 - 1:55 | Implantacao e validacao

Mostre no terminal:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 app db
```

Narracao: "Aqui eu construo a imagem e inicio os servicos. No `ps`, confiro o estado e as portas. Nos logs, verifico as migracoes, a preparacao dos dados iniciais, o inicio do servidor e se o PostgreSQL subiu sem erros criticos. Depois valido a conexao da aplicacao com o banco pelo endpoint `/api/health`."

## 1:55 - 2:25 | Testes

Mostre:

```bash
docker compose --profile test run --rm tests
```

Narracao: "Os testes unitarios verificam regras como quantidade, preco, campos obrigatorios e status. Os testes de integracao usam outro PostgreSQL, isolado do banco principal. Eles validam o cardapio, o login, o bloqueio de rotas administrativas sem token, o cadastro de produto, a criacao de pedido e a atualizacao do status."

## 2:25 - 3:05 | Demonstracao do sistema

1. Abra `http://localhost:3000`.
2. Filtre o cardapio, adicione dois produtos e envie um pedido.
3. Mostre o codigo de confirmacao.
4. Abra `http://localhost:3000/admin` e entre com as credenciais do `.env`.
5. Mostre o pedido no painel e altere seu status para "Preparando" ou "Pronto".
6. Abra a area Produtos e mostre o cadastro/edicao ou a opcao de ocultar um item.

Narracao: "Na tela publica, o estudante monta a sacola e envia o pedido. No painel da equipe, a cantina ve os itens e atualiza o andamento. Tambem consegue manter o cardapio atualizado sem mexer no codigo."

## 3:05 - 3:30 | Seguranca, escala e RDM

"Na seguranca, as senhas sao guardadas com bcrypt, as rotas administrativas usam JWT, as consultas SQL sao parametrizadas e o servidor valida os dados. O login e o envio de pedidos possuem limites de requisicoes, e o banco nao fica exposto publicamente. Para escalar a um milhao de usuarios e cem mil simultaneos, seria necessario balanceador, varias replicas da API, CDN, cache, filas e PostgreSQL de alta disponibilidade com pool de conexoes e replicas de leitura. Isso e uma evolucao conceitual e teria que ser dimensionado com testes de carga."

Mostre a `Ficha-RDM.pdf` e explique a versao, data, parametros, testes e status final. Se ainda nao rodou os testes/implantacao no seu ambiente, diga que a homologacao esta pendente; depois de executar com sucesso, atualize a ficha.

## Antes de gravar

- Troque `[seu nome]` pela sua apresentacao.
- Suba a aplicacao e rode os testes no seu Docker.
- Nao mostre o valor real de `JWT_SECRET`, `POSTGRES_PASSWORD` ou `ADMIN_PASSWORD` na gravacao.
- Garanta que aparecam `docker compose ps`, logs e o resultado dos testes.
- Mantenha o video entre 2 e 5 minutos.
