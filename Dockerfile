# Passenger Tales container for Google Cloud Run (or any container host).
# Serves the static PWA plus /api/tts, /api/lore, and /api/session.
# Gemini keys and GCS access are provided at runtime — never baked into the image.

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Cloud Run sets PORT (default 8080) and the server honours it.
EXPOSE 8080

CMD ["node", "server.js"]
