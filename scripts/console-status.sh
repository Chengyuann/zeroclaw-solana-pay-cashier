#!/usr/bin/env bash
set -euo pipefail

host="${CASHIER_CONSOLE_HOST:-127.0.0.1}"
port="${CASHIER_CONSOLE_PORT:-4317}"
session="zeroclaw-cashier-console"
screen_output="$(screen -ls 2>&1 || true)"
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pid="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1 || true)"

if curl --max-time 2 -fsS "http://$host:$port/" >/dev/null 2>&1; then
  if printf '%s\n' "$screen_output" | grep -q "[.]$session"; then
    printf 'running http://%s:%s/ screen=%s pid=%s\n' "$host" "$port" "$session" "${pid:-unknown}"
  elif [[ -n "$pid" ]] &&
    ps -p "$pid" -o command= | grep -q "$project_dir/dist/console-server.js"; then
    printf 'running http://%s:%s/ managed-orphan pid=%s\n' "$host" "$port" "$pid"
  else
    printf 'running http://%s:%s/ unmanaged\n' "$host" "$port"
  fi
  exit 0
fi

printf 'stopped http://%s:%s/\n' "$host" "$port"
exit 1
