# ── RingWave backend ─────────────────────────────────────────────────────────
#
# Uses node:22-slim (Debian, glibc) rather than an alpine image on purpose:
# bcrypt is a native (node-gyp) module and ships prebuilt binaries for glibc
# targets. On alpine (musl libc) there's no matching prebuild, so npm falls
# back to compiling from source — which needs python3/make/g++ in the image
# and adds real build time. Staying on glibc avoids all of that.
FROM node:22-slim

WORKDIR /app

# Install dependencies first, separately from application code, so Docker's
# layer cache is only invalidated by a package.json/package-lock.json change
# — not by every source file edit.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Run as a non-root user. The image ships a "node" user/group by default;
# just switch to it instead of running the app as root.
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production

# Railway/Render inject PORT at runtime and route traffic to whatever port
# the app actually listens on — this EXPOSE is documentation for local
# `docker run`/Compose, not something either platform reads.
EXPOSE 5000

# Curl isn't installed in node:22-slim by default; use Node itself to hit
# /health so we don't need to add another package just for this. Failing
# the healthcheck (non-zero exit) is what lets Railway/Render/Compose know
# to restart the container instead of leaving it silently unresponsive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
