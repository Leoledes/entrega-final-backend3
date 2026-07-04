# --------------------------------------------------------------------------
# Etapa 1: dependencias
# Se instalan las dependencias en una etapa separada para aprovechar el cache
# de capas de Docker: mientras no cambie package*.json, esta etapa no se
# vuelve a ejecutar en builds posteriores.
# --------------------------------------------------------------------------
FROM node:18-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./

# Solo dependencias de produccion: mas liviano y mas seguro (sin devDependencies
# como mocha, chai, sinon en la imagen final).
RUN npm ci --omit=dev

# --------------------------------------------------------------------------
# Etapa 2: imagen final de ejecucion
# --------------------------------------------------------------------------
FROM node:18-alpine AS production

# Buenas practicas de seguridad: no correr el proceso como root.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

# Copiamos solo node_modules ya instalado (sin devDependencies) desde la etapa anterior.
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# La carpeta donde multer guarda las imagenes subidas debe existir y ser
# escribible por el usuario no-root.
RUN mkdir -p /app/src/public/img && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

# Healthcheck basico para que Docker/orquestadores sepan si el contenedor
# esta respondiendo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/api/adoptions', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/app.js"]
