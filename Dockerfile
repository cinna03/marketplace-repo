FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY . .
RUN npm run build -w @marketplace/contracts \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @marketplace/api
ENV NODE_ENV=production
ENV PORT=8080
ENV WEB_ROOT=/app/apps/web
EXPOSE 8080
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
