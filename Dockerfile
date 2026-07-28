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

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/scripts ./apps/server/scripts
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3001
# Sincroniza el esquema SQLite si hay disco disponible y arranca el servidor.
CMD ["sh", "-c", "node apps/server/scripts/run-prisma.mjs db push --skip-generate || echo 'Sin SQLite: se usaran estadisticas en memoria'; node apps/server/dist/index.js"]
