# ── RingWave frontend ───────────────────────────────────────────────────────
#
# Two-stage build: compile the Vite/React app in a Node image, then serve
# the resulting static files with nginx — the final image ships no Node
# runtime, no node_modules, no source, just the built assets and nginx.
#
# IMPORTANT — build-time vs runtime env vars:
# Vite's VITE_* variables are baked into the compiled JS at `npm run build`
# time, not read at container startup. That means, unlike the backend/
# ai-service images, you cannot change these by setting environment
# variables on the running container — they must be passed as Docker build
# ARGs, e.g.:
#
#   docker build \
#     --build-arg VITE_API_URL=https://your-backend.up.railway.app/api/v1 \
#     --build-arg VITE_SOCKET_URL=https://your-backend.up.railway.app \
#     --build-arg VITE_DETECTION_WS_URL=wss://your-ai-service.up.railway.app/ws/detect \
#     -t ringwave-frontend .
#
# If you're deploying to Vercel instead of this Dockerfile, Vercel runs its
# own build step and reads these from the project's Environment Variables
# settings instead — see vercel.json / the deployment notes in the repo root.
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_DETECTION_WS_URL
ARG VITE_APP_NAME=RingWave
ARG VITE_APP_VERSION=1.0.0

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SOCKET_URL=${VITE_SOCKET_URL}
ENV VITE_DETECTION_WS_URL=${VITE_DETECTION_WS_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# node_modules/.bin/vite and the rollup native binary have both bitten this
# repo before in this exact environment (missing +x permission, and a
# missing @rollup/rollup-linux-x64-gnu optional dependency respectively —
# both are known npm bugs on certain npm/platform combinations). Guard
# against both explicitly rather than relying on `npm ci` having gotten it
# right silently.
RUN chmod +x node_modules/.bin/* \
  && (node -e "require('@rollup/rollup-linux-x64-gnu')" 2>/dev/null || npm install @rollup/rollup-linux-x64-gnu --no-save) \
  && npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
