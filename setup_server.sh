#!/bin/bash
# Setup 7 FlareSolverr instances + curl_cffi on a server
set -e

echo "=== Installing Docker ==="
if ! which docker > /dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
fi

echo "=== Installing curl_cffi ==="
pip3 install --break-system-packages curl_cffi requests -q 2>/dev/null || pip3 install curl_cffi requests -q 2>/dev/null || true

echo "=== Installing Playwright (for Browser Mode) ==="
pip3 install --break-system-packages playwright -q 2>/dev/null || pip3 install playwright -q 2>/dev/null || true
playwright install chromium --with-deps 2>/dev/null || python3 -m playwright install chromium --with-deps 2>/dev/null || true
echo "  Playwright installed!"

echo "=== Starting 7 FlareSolverr instances ==="
docker pull ghcr.io/flaresolverr/flaresolverr:latest 2>/dev/null || true

for i in 1 2 3 4 5 6 7; do
    port=$((8190 + i))
    if [ $i -eq 1 ]; then name="flaresolverr"; else name="flaresolverr${i}"; fi
    if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
        echo "  OK $name on port $port"
        continue
    fi
    docker rm -f $name 2>/dev/null || true
    docker run -d --name $name --restart=unless-stopped -p ${port}:8191 -e LOG_LEVEL=info --memory=512m ghcr.io/flaresolverr/flaresolverr:latest
    echo "  Started $name on port $port"
done

echo "=== Waiting ==="
sleep 10
ok=0
for port in 8191 8192 8193 8194 8195 8196 8197; do
    for attempt in $(seq 1 10); do
        if curl -s http://localhost:$port/ | grep -q "FlareSolverr"; then ok=$((ok+1)); break; fi
        sleep 2
    done
done
echo "  $ok/7 instances ready!"
exit 0
