#!/bin/sh
# Start a private PostgreSQL cluster, create + seed the playground database,
# then run the app in the foreground.
set -e
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | head -n 1)

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" > /dev/null
fi
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-c listen_addresses=127.0.0.1' -l $PGDATA/server.log -w start" > /dev/null

node server/scripts/init-db.js
exec node server/index.js
