# Etapa de producao: imagem pequena, dependencias minimas e usuario sem privilegios.
FROM node:22-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node src/server.js"]

# Etapa separada para executar testes; nao e usada pelo servico de producao.
FROM node:22-alpine AS test
ENV NODE_ENV=test
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
CMD ["npm", "test"]
