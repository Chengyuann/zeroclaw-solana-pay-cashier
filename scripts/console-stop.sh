#!/usr/bin/env bash
set -euo pipefail

session="zeroclaw-cashier-console"
project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${CASHIER_STATE_DIR:-.state}"
state_dir="$(cd "$project_dir" && mkdir -p "$state_dir" && cd "$state_dir" && pwd)"
pid_file="$state_dir/console-runtime/server.pid"
port="${CASHIER_CONSOLE_PORT:-4317}"

screen_output="$(screen -ls 2>&1 || true)"
screen_id="$(printf '%s\n' "$screen_output" | awk -v name=".$session" '$1 ~ name { print $1; exit }')"
if [[ -n "$screen_id" ]]; then
  screen -S "$screen_id" -X quit
  printf 'Stopped cashier console screen session %s.\n' "$screen_id"
else
  printf 'No cashier console screen session is running.\n'
fi

candidate_pids=()
if [[ -f "$pid_file" ]]; then
  candidate_pids+=("$(cat "$pid_file")")
fi
while IFS= read -r pid; do
  [[ -n "$pid" ]] && candidate_pids+=("$pid")
done < <(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)

for pid in "${candidate_pids[@]}"; do
  [[ -z "$pid" ]] && continue
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$command" == *"$project_dir/dist/console-server.js"* ]]; then
    kill "$pid" 2>/dev/null || true
  fi
done

rm -f "$pid_file"
