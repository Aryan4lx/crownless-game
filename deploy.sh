#!/usr/bin/env bash
# Resilient deploy to VPS — retries SCP/SSH on network drops (Iran ISP filtering)
# Usage: bash deploy.sh
set -euo pipefail

SSH_KEY="C:/Users/mhmdz/OneDrive/Desktop/parsvds-Hermes.pem"
VPS="root@181.41.194.96"
PORT=9011
SSH_OPTS="-o ConnectTimeout=30 -o ServerAliveInterval=10 -o ServerAliveCountMax=3"
MAX_RETRIES=4

cd "$(dirname "$0")"

echo "[1/4] Building client..."
cd client && npm run build 2>&1 | tail -3
cd ..

echo "[2/4] Packing tarball..."
tar -czf crownless.tar.gz \
  client/dist server/src server/index.js server/package.json \
  server/test-persistence.mjs server/test-xp.mjs server/test-camps.mjs \
  2>/dev/null

echo "[3/4] Uploading (up to $MAX_RETRIES attempts)..."
for i in $(seq 1 $MAX_RETRIES); do
  if scp -P $PORT -i "$SSH_KEY" $SSH_OPTS -C crownless.tar.gz "$VPS:/tmp/"; then
    echo "  SCP OK (attempt $i)"
    break
  fi
  echo "  SCP failed (attempt $i/$MAX_RETRIES), retrying in 5s..."
  sleep 5
  if [ $i -eq $MAX_RETRIES ]; then
    echo "  UPLOAD FAILED after $MAX_RETRIES attempts. Code is pushed to git."
    echo "  You can deploy manually from VPS: git pull && cd server && node index.js"
    exit 1
  fi
done

echo "[4/4] Deploying on VPS..."
for i in $(seq 1 $MAX_RETRIES); do
  if ssh -p $PORT -i "$SSH_KEY" $SSH_OPTS "$VPS" 'su - game -c "
    pkill node 2>/dev/null;
    mkdir -p /home/game/crownless_deploy;
    tar -xzf /tmp/crownless.tar.gz -C /home/game/crownless_deploy;
    cd /home/game/crownless_deploy/server;
    nohup /home/game/node/node index.js > server.log 2>&1 &
  "; sleep 3; curl -s -m 5 http://localhost:3000/health'; then
    echo ""
    echo "[DONE] Deployed. Health check above."
    exit 0
  fi
  echo "  SSH deploy failed (attempt $i/$MAX_RETRIES), retrying..."
  sleep 3
done

echo "[FAIL] Could not complete remote deploy. Code is in git."
exit 1
