#!/usr/bin/env bash
set -euo pipefail

host="${CASHIER_CONSOLE_HOST:-127.0.0.1}"
port="${CASHIER_CONSOLE_PORT:-4317}"
state_dir="${CASHIER_STATE_DIR:-.state}"
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="$(cd "$project_dir" && mkdir -p "$state_dir" && cd "$state_dir" && pwd)"
runtime_dir="$state_dir/console-runtime"
session="zeroclaw-cashier-console"
log_file="$runtime_dir/server.log"
error_file="$runtime_dir/server.err.log"
pid_file="$runtime_dir/server.pid"

mkdir -p "$runtime_dir"

if curl --max-time 2 -fsS "http://$host:$port/" >/dev/null 2>&1; then
  existing_pid="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "$existing_pid" ]] &&
    ps -p "$existing_pid" -o command= | grep -q "$project_dir/dist/console-server.js"; then
    printf '%s\n' "$existing_pid" >"$pid_file"
  fi
  printf 'Cashier console already running: http://%s:%s/\n' "$host" "$port"
  exit 0
fi

cd "$project_dir"
npm run build >/dev/null

screen -S "$session" -X quit >/dev/null 2>&1 || true

printf -v command \
  'cd %q && exec env CASHIER_CONSOLE_HOST=%q CASHIER_CONSOLE_PORT=%q CASHIER_STATE_DIR=%q %q %q >>%q 2>>%q' \
  "$project_dir" \
  "$host" \
  "$port" \
  "$state_dir" \
  "$(node -p 'process.execPath')" \
  "$project_dir/dist/console-server.js" \
  "$log_file" \
  "$error_file"

screen -dmS "$session" /bin/bash -lc "$command"

for _ in {1..40}; do
  if curl --max-time 2 -fsS "http://$host:$port/" >/dev/null 2>&1; then
    pid="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    [[ -n "$pid" ]] && printf '%s\n' "$pid" >"$pid_file"
    printf 'Cashier console: http://%s:%s/ (screen session %s)\n' \
      "$host" "$port" "$session"
    exit 0
  fi
  sleep 0.25
done

printf 'Console failed to start. See %s\n' "$error_file" >&2
exit 1
