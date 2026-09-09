FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional
COPY . .
RUN npx tsc -p tsconfig.web.json
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/src/web-cli.js"]
