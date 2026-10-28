FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
RUN npm ci
COPY apps ./apps
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev
COPY --from=build /app/apps/server/dist apps/server/dist
COPY apps/server/fixtures apps/server/fixtures
COPY apps/web apps/web
USER node
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "apps/server/dist/index.js"]
