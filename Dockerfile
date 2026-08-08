# Imagen unica: compila el monorepo y sirve cliente + servidor desde un solo
# proceso Node. Pensada para plataformas tipo Render, Fly.io o Railway.
FROM node:22-alpine AS build
WORKDIR /app

# Prisma necesita openssl para sus motores nativos.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/game-engine/package.json packages/game-engine/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# npm ci exige que el lockfile este sincronizado: si alguien cambia una
# dependencia sin actualizarlo, el build falla aqui y no con un arbol raro.
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build && npm run db:generate
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
COPY --from=build /app/apps/web/dist ./apps/web/dist

# El proceso no necesita privilegios: solo lee su propio codigo y, con SQLite,
# escribe el fichero de base de datos. `node` es un usuario sin privilegios que
# ya viene en la imagen oficial.
RUN chown -R node:node /app
USER node

EXPOSE 3001
# El proveedor de base de datos depende de DATABASE_URL, que solo se conoce al
# arrancar: con `file:` se usa SQLite y con `postgres://` PostgreSQL. Por eso el
# cliente de Prisma se regenera aqui y no en la construccion de la imagen, y por
# eso `db push` va despues. Si algo falla se sigue arrancando: el servidor cae
# al almacen en memoria y la partida funciona igual, solo se pierden las
# estadisticas historicas.
CMD ["sh", "-c", "node apps/server/scripts/run-prisma.mjs generate && node apps/server/scripts/run-prisma.mjs db push --skip-generate || echo 'Sin base de datos: se usaran estadisticas en memoria'; node apps/server/dist/index.js"]
