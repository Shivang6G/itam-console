# syntax=docker/dockerfile:1.7
# One image, three jobs: the web app (default CMD), the migration task, and the scheduled worker.
# ECS overrides the command for the latter two: `node .output/worker/index.mjs <migrate|expiry-alerts|discover-aws>`.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Amazon RDS CA bundle: the app verifies the database certificate (sslmode=verify-full equivalent).
RUN mkdir -p /app/certs \
 && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /app/certs/global-bundle.pem \
 && test -s /app/certs/global-bundle.pem

ENV NODE_ENV=production \
    PORT=8080 \
    DB_CA_PATH=/app/certs/global-bundle.pem

# The Nitro output is self-contained (its own node_modules). No source, no devDependencies.
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/drizzle ./drizzle

USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
