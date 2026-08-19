# Passenger Tales container for Google Cloud Run (or any container host).
# The app has no dependencies, so this just runs the Node server which serves
# the static PWA plus the /api/tts and /api/lore proxy endpoints.
#
# The Gemini API key is provided at runtime via the GEMINI_API_KEY env var
# (set it as a Cloud Run secret) — it is never baked into the image.

FROM node:22-slim

WORKDIR /app

# Install production deps if any are ever added (no-op while dependency-free).
COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
# Cloud Run sets PORT (default 8080) and the server honours it.
EXPOSE 8080

CMD ["node", "server.js"]
