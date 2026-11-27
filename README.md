# EstuLanches

Sistema web de cardapio e pedidos para cantina escolar. O estudante consulta os produtos, monta uma sacola e envia um pedido. A equipe da cantina acessa um painel protegido para acompanhar pedidos, atualizar status e administrar o catalogo.

**Versao:** 1.0.0  
**Stack:** HTML, CSS, JavaScript, Node.js 22, Express 5 e PostgreSQL 17  
**Implantacao:** Docker + Docker Compose

## 1. Funcionalidades

### Area do estudante
- Cardapio carregado pela API e organizado por categoria.
- Sacola com inclusao, remocao e ajuste de quantidades.
- Envio do pedido com nome, turma e observacoes opcionais.
- Codigo de confirmacao e total calculado no servidor.

### Area da equipe (`/admin`)
- Login administrativo.
- Indicadores e resumo da operacao.
- Consulta dos ultimos pedidos, itens e valores.
- Atualizacao de status: recebido, preparando, pronto, entregue ou cancelado.
- Cadastro, edicao e ativacao/desativacao de produtos.

O projeto inicia com produtos demonstrativos e cria o administrador inicial a partir das variaveis do arquivo `.env`.

## 2. Arquitetura

```text
Navegador do estudante/equipe
            |
            | HTTP :3000
            v
  Node.js 22 + Express 5
  - arquivos HTML/CSS/JS
  - API REST /api
  - autenticacao JWT
  - validacao e regras de negocio
            |
            | rede interna Docker
            v
       PostgreSQL 17
       - produtos
       - administradores
       - pedidos e itens
       - volume persistente
```

A interface usa JavaScript puro para manter o projeto simples de entender e modificar. O Express entrega os arquivos estaticos e a API pela mesma origem, portanto nao e necessario habilitar CORS. O PostgreSQL armazena os dados de forma persistente em um volume Docker.

## 3. Requisitos

- Docker Desktop atualizado com Docker Compose v2, ou Docker Engine + plugin Compose.
- Git (opcional, para publicar no GitHub).
- Navegador moderno.

Nao e necessario instalar Node.js ou PostgreSQL na maquina para executar o ambiente Docker.

## 4. Configuracao e implantacao

Abra o terminal na pasta do projeto.

### 4.1 Preparar variaveis de ambiente

Linux/macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e substitua, principalmente, `POSTGRES_PASSWORD`, `JWT_SECRET` e `ADMIN_PASSWORD`. Use senhas diferentes. Para `POSTGRES_PASSWORD`, prefira letras, numeros, `_` ou `-` (o Compose monta a URL de conexao usando esse valor). Gere um `JWT_SECRET` aleatorio de pelo menos 32 caracteres (por exemplo, `openssl rand -hex 32`). **Nao publique o arquivo `.env` no GitHub.** O `.gitignore` ja o protege.

O administrador inicial usa `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos no `.env`. O cadastro e idempotente: reiniciar o container nao duplica o administrador nem os produtos demonstrativos. Para alterar a senha de uma conta ja criada, faca a rotacao pela administracao do banco ou implemente um fluxo proprio de redefinicao; mudar somente a variavel nao sobrescreve um hash existente.

### 4.2 Executar em desenvolvimento sem colocar a API no Docker (opcional)

O projeto carrega automaticamente as variaveis do arquivo `.env` usando `dotenv`. Para rodar a API com `npm run dev` no Windows, primeiro copie `.env.example` para `.env`, confira se `DATABASE_URL` usa `localhost` (e nao `db`) e deixe o PostgreSQL iniciado. Uma forma simples e iniciar somente o banco pelo Docker Compose:

```powershell
Copy-Item .env.example .env   # execute apenas se ainda nao existir .env
docker compose up -d db
npm install
npm run migrate
npm run seed
npm run dev
```

Nesse modo, a conexao local deve seguir este formato: `postgres://USUARIO:SENHA@localhost:5432/NOME_DO_BANCO`. O hostname `db` so funciona entre containers na rede interna do Compose. Se a porta 5432 estiver ocupada no computador, altere `DB_PORT` e a porta em `DATABASE_URL` para o mesmo valor.

O `docker compose up -d --build` continua sendo o modo de implantacao completo: nele a API roda dentro do container e o Compose injeta uma `DATABASE_URL` apontando para `db:5432`.

### 4.3 Construir a imagem e subir os servicos

```bash
docker compose up -d --build
```

O Compose inicia o PostgreSQL, aguarda o healthcheck do banco e depois inicia a aplicacao. No primeiro inicio, a aplicacao executa as migracoes SQL e prepara os dados iniciais.

### 4.4 Conferir servicos e portas

```bash
docker compose ps
```

Resultado esperado: `app` e `db` com estado `Up` / `healthy`. A aplicacao publica a porta `3000` (ou o valor de `APP_PORT`). O PostgreSQL usa a porta `5432` dentro da rede Docker e, para facilitar a verificacao local, fica publicado apenas em `127.0.0.1:5432` (ou `DB_PORT`). Nao exponha a porta do banco diretamente na internet.

### 4.5 Auditar logs

```bash
docker compose logs --tail=100 app db
```

Procure por:
- `[migrate] ... aplicado com sucesso` no primeiro inicio;
- `[seed] Administrador e cardapio inicial conferidos`;
- `[server] EstuLanches iniciado na porta 3000`;
- mensagens de inicializacao normal do PostgreSQL;
- ausencia de `FATAL`, `ERROR`, falha de autenticacao, erro de conexao ou reinicio repetido.

Para acompanhar em tempo real:

```bash
docker compose logs -f app db
```

### 4.6 Validar aplicacao e banco

Abra `http://localhost:3000`. A API tambem oferece uma verificacao que consulta o banco:

```bash
curl http://localhost:3000/api/health
```

Resposta esperada:

```json
{"status":"ok","database":"connected","service":"estulanches-api"}
```

Acesse `http://localhost:3000/admin` e entre com o e-mail e a senha definidos no `.env`.

## 5. Testes automatizados

Os testes usam a biblioteca nativa `node:test`.

- **Unitarios:** regras de validacao de pedido, produto, quantidade e status.
- **Integracao:** inicializa um banco PostgreSQL separado, valida healthcheck e cardapio, testa bloqueio sem token, login, cadastro de produto, criacao de pedido, leitura dos itens e atualizacao do status.

Execute pelo Compose:

```bash
docker compose --profile test run --rm tests
```

O perfil `test` cria um servico `db-test` descartavel e isolado. Os testes nao usam o volume nem os dados do banco de producao. O comando termina com codigo diferente de zero se alguma assercao falhar.

Para executar somente os testes unitarios localmente, depois de instalar as dependencias:

```bash
npm install
npm run test:unit
```

Os testes de integracao locais precisam de um banco PostgreSQL de teste e da variavel `TEST_DATABASE_URL`.

## 6. Endpoints principais

| Metodo | Endpoint | Acesso | Funcao |
|---|---|---|---|
| GET | `/api/health` | Publico | Verifica API e banco |
| GET | `/api/menu` | Publico | Lista produtos disponiveis |
| POST | `/api/orders` | Publico | Cria pedido |
| POST | `/api/auth/login` | Publico, limitado por taxa | Autentica administrador |
| GET | `/api/admin/dashboard` | Administrador | Indicadores |
| GET/POST | `/api/admin/products` | Administrador | Lista e cadastra produtos |
| PUT | `/api/admin/products/:id` | Administrador | Edita produto |
| PATCH | `/api/admin/products/:id/availability` | Administrador | Ativa/oculta produto |
| GET | `/api/admin/orders` | Administrador | Lista pedidos e itens |
| PATCH | `/api/admin/orders/:id/status` | Administrador | Atualiza status |

As rotas administrativas exigem `Authorization: Bearer <token>`.

## 7. Seguranca aplicada

- Senhas administrativas armazenadas com hash bcrypt (nao em texto puro).
- JWT assinado com segredo externo ao codigo e validade de quatro horas.
- Token mantido em memoria no navegador; nao e salvo em `localStorage`.
- Helmet com Content Security Policy, bloqueio de framing e `X-Powered-By` desativado.
- Limite de requisicoes para login e criacao de pedidos.
- SQL parametrizado para evitar injecao SQL.
- Validacao de dados no servidor, mesmo quando a interface ja valida campos.
- Limite de tamanho do JSON, usuario `node` sem privilegios e container com filesystem somente leitura.
- Banco sem exposicao publica: comunicacao entre aplicacao e banco pela rede interna Docker.
- Logs Docker com rotacao para limitar crescimento em disco.

Antes de uso real, ainda devem ser configurados HTTPS por proxy reverso, backups testados, rotacao de segredos, politica de privacidade/retencao de dados, monitoramento e revisao de seguranca. O projeto e uma base didatica funcional, nao uma certificacao de seguranca.

## 8. Escalabilidade conceitual: 1 milhao de usuarios / 100 mil simultaneos

Uma unica maquina com um container Node.js e um PostgreSQL nao suportaria com seguranca essa carga. Para atender um pais inteiro, a arquitetura precisaria evoluir:

1. **Borda e distribuicao:** DNS, CDN para arquivos estaticos, protecao DDoS/WAF e balanceador de carga distribuiriam requisicoes entre varias instancias.
2. **Aplicacao horizontal:** executar varias replicas stateless da API em Kubernetes ou servico equivalente, com autoscaling por CPU, memoria, latencia e fila. Nenhuma instancia dependeria de arquivos locais ou memoria compartilhada.
3. **Cache e filas:** Redis para cache de cardapio/sessoes e controle distribuido de limites; fila (RabbitMQ, Kafka ou servico gerenciado) para notificacoes, relatorios e tarefas que nao precisam bloquear a resposta do pedido.
4. **Banco:** PostgreSQL gerenciado em alta disponibilidade, connection pooling (PgBouncer), indices, replicas de leitura e particionamento quando a volumetria justificar. Escritas de pedidos continuam transacionais no banco principal.
5. **Operacao:** metricas, logs centralizados, tracing, alertas, backups, recuperacao de desastre e testes de carga com cenarios de pico antes de dimensionar infraestrutura.

Para 100 mil requisicoes simultaneas, o dimensionamento deve partir de testes de carga e metas explicitas de latencia/ disponibilidade. O numero de usuarios cadastrados nao equivale ao numero de requisicoes por segundo. A capacidade final depende do perfil de uso, tamanho dos pedidos, consultas, banco, rede e infraestrutura contratada.

## 9. Publicar no GitHub

Crie um repositorio vazio no GitHub. Dentro da pasta do projeto, execute:

```bash
git init
git add .
git commit -m "feat: primeira versao do EstuLanches"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/estulanches.git
git push -u origin main
```

Troque `SEU-USUARIO` pelo seu usuario do GitHub. Confira na pagina do repositorio que `Dockerfile`, `docker-compose.yml`, codigo, testes, README, roteiro e `Ficha-RDM.pdf` foram publicados. O `.env` nao deve aparecer no repositorio.

## 10. Encerrar ambiente

```bash
docker compose down
```

Os dados continuam guardados no volume. Para apagar tambem o banco e todos os pedidos locais (acao destrutiva):

```bash
docker compose down -v
```

---

**Nota de validacao:** a ficha RDM incluida no pacote identifica a versao e os parametros previstos, mas marca a implantacao como pendente de homologacao ate que os comandos Docker, os logs e os testes sejam executados no ambiente de destino. Nao registre como aprovado um teste que ainda nao foi executado.
