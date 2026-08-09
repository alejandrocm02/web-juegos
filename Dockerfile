# Imagen unica: compila el monorepo y sirve cliente + servidor desde un solo
# proceso Node. Pensada para plataformas tipo Render, Fly.io o Railway.
FROM node:22-alpine AS build
WORKDIR /app

# Prisma necesita openssl para sus motores nativos. Las tres siguientes son
# para better-sqlite3: publica binarios precompilados para glibc, no para la
# musl de Alpine, asi que aqui prebuild-install falla y cae a node-gyp, que
# necesita compilador. Solo afecta a la etapa de build; la imagen final no las
# lleva.
RUN apk add --no-cache openssl python3 make g++

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/game-engine/package.json packages/game-engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# npm ci exige que el lockfile este sincronizado: si alguien cambia una
# dependencia sin actualizarlo, el build falla aqui y no con un arbol raro.
RUN npm ci --no-audit --no-fund

COPY . .
# build:packages ya encadena db:generate, que desde Prisma 7 es obligatorio:
# el cliente se genera dentro de src y forma parte de lo que compila tsc.
RUN npm run build
# La imagen final solo necesita dependencias de produccion. Prisma permanece
# porque la sincronizacion de SQLite se realiza al arrancar.
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/game-engine/package.json ./packages/game-engine/package.json
COPY --from=build /app/packages/game-engine/dist ./packages/game-engine/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/scripts ./apps/server/scripts
# Desde Prisma 7 la CLI no arranca sin su fichero de configuracion: ahi vive la
# cadena de conexion que antes estaba en el datasource del esquema. Sin esto el
# `db push` del arranque falla y el servidor cae al almacen en memoria.
COPY --from=build /app/apps/server/prisma.config.mjs ./apps/server/prisma.config.mjs
COPY --from=build /app/apps/web/dist ./apps/web/dist

# El proceso publico no necesita privilegios: la imagen base trae el usuario
# `node` (uid 1000). Solo el directorio de Prisma debe ser escribible, porque
# el arranque sincroniza el esquema SQLite ahi.
RUN chown -R node:node /app/apps/server/prisma
USER node

EXPOSE 3001
# Sincroniza el esquema SQLite si hay disco disponible y arranca el servidor.
# `--skip-generate` desaparecio en Prisma 7: `db push` ya no genera cliente, asi
# que la opcion sobra y ademas aborta el comando por argumento desconocido.
CMD ["sh", "-c", "node apps/server/scripts/run-prisma.mjs db push || echo 'Sin SQLite: se usaran estadisticas en memoria'; node apps/server/dist/index.js"]
