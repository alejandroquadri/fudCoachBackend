ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

COPY package.json yarn.lock tsconfig.json ./
RUN yarn install --frozen-lockfile --non-interactive
COPY src ./src
RUN yarn build \
  && yarn cache clean

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=true --non-interactive \
  && yarn cache clean

COPY --from=build /app/dist ./dist
COPY public ./public
COPY certs ./certs

ENV PORT=3000
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
