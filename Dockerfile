# Private hosted instance (#55). The server ships with the web/ front end built in server mode (it talks to this server's API);
# the public demo in web/ is built separately.
FROM node:24-slim AS web
WORKDIR /build
COPY src ./src
COPY examples/luna-demo.json examples/luna-ai.json ./examples/
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund
COPY web ./web
RUN cd web && npm run build:server

FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
COPY --from=web /build/web/dist ./web/dist
ENV NODE_ENV=production DAYWEAVE_DATA_DIR=/data PORT=8080 DAYWEAVE_WEB_DIST=/app/web/dist
EXPOSE 8080
# The platform mounts the data volume owned by root; hand it to the unprivileged node user, then drop root.
CMD ["sh","-c","mkdir -p /data && chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups node scripts/serve.cjs"]
