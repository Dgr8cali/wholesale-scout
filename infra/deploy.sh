#!/usr/bin/env bash
# Deploy Wholesale Scout on the server:  cd ~/wholesale-scout && ./infra/deploy.sh [git-ref]
# Pulls the ref (default origin/main), builds the image, swaps the container, checks it answers.
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-origin/main}"
echo "==> fetching $REF"
git fetch --quiet origin
git checkout --quiet --detach "$REF"
echo "==> at $(git log -1 --format='%h %s')"
echo "==> building image"
docker compose -f infra/docker-compose.yml build --pull
echo "==> starting"
docker compose -f infra/docker-compose.yml up -d
echo "==> waiting for the app"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/favicon.ico || true)
  if [ "$code" = "200" ]; then echo "==> up (HTTP $code) after ${i}s"; docker image prune -f >/dev/null; exit 0; fi
  sleep 1
done
echo "!! app did not answer in 30s; last 40 log lines:"
docker compose -f infra/docker-compose.yml logs --tail=40 app
exit 1
