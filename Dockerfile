# Private hosted instance (#55). Only the server and its browser assets ship; the public demo in web/ is built separately.
FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
ENV NODE_ENV=production DAYWEAVE_DATA_DIR=/data PORT=8080
EXPOSE 8080
# The platform mounts the data volume owned by root; hand it to the unprivileged node user, then drop root.
CMD ["sh","-c","mkdir -p /data && chown -R node:node /data && exec setpriv --reuid=node --regid=node --init-groups node scripts/serve.cjs"]
