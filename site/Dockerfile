# Self-contained playground: PostgreSQL + API server + built React client in
# one container. Every container starts from a brand-new database cluster
# (no volume), so parallel containers never share state.
#
#   docker build -t webreplaybench .
#   docker run --rm -p 4000:4000 -p 127.0.0.1:4001:4001 webreplaybench
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY client/package.json client/package-lock.json client/
RUN npm --prefix client ci
COPY . .
RUN npm --prefix client run build && rm -rf client/node_modules

# The admin/oracle API listens on all interfaces inside the container; publish
# it on 127.0.0.1 only (see the run command above).
ENV PORT=4000 \
    ADMIN_PORT=4001 \
    ADMIN_HOST=0.0.0.0 \
    DATABASE_URL=postgres://postgres@127.0.0.1:5432/playground \
    PGDATA=/var/lib/postgresql/playground
EXPOSE 4000 4001

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
