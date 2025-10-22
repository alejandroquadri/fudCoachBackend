# ---- Build stage: compile TypeScript to dist/ ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first (better layer caching)
COPY package.json yarn.lock ./
RUN yarn install

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN yarn build   # runs: tsc --project tsconfig.json

# ---- Runtime stage: run compiled JS ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Only production deps
COPY package.json yarn.lock ./
RUN yarn install --production

# Bring compiled code
COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000
CMD ["node","dist/index.js"]

