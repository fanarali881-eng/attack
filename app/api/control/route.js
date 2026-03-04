import { NextResponse } from 'next/server';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const DEFAULT_SERVERS = [
  { host: '46.101.52.177', username: 'root' },
  { host: '138.68.141.40', username: 'root' },
  { host: '144.126.234.13', username: 'root' },
  { host: '161.35.167.208', username: 'root' },
  { host: '167.99.192.89', username: 'root' },
  { host: '165.22.113.176', username: 'root' }
];

const SETUP_COMMAND = 'export DEBIAN_FRONTEND=noninteractive && apt-get update -y && apt-get install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 fonts-liberation xdg-utils && (apt-get install -y libasound2 2>/dev/null || apt-get install -y libasound2t64 2>/dev/null || true) && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt-get install -y ./google-chrome-stable_current_amd64.deb 2>/dev/null; rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage python-socketio websocket-client --break-system-packages 2>/dev/null || pip3 install DrissionPage python-socketio websocket-client && echo SETUP_COMPLETE';

async function runSSHCommand(server, command, timeout = 15000) {
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
      readyTimeout: 10000,
      keepaliveInterval: 5000,
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
          const r = await runSSHCommand(server, `nohup bash -c '${SETUP_COMMAND}' > /root/setup.log 2>&1 & echo "Setup started"`, 15000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'deploy') {
      // Deploy the latest visit.py from the servers (already deployed via SSH)
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'wc -c /root/visit.py && grep -c auto_detect_mode /root/visit.py && echo "Script verified"', 10000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'start') {
      if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
      const totalVisitors = visitors || 100;
      const serverCount = serverList.length;

      // Divide total visitors across all servers
      const perServer = Math.ceil(totalVisitors / serverCount);

      // Step 1: Kill old processes and clean up on all servers
      await Promise.all(
        serverList.map(async (server) => {
          await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; kill -9 $(pgrep -f "proxy_relay.py") 2>/dev/null; killall -9 chrome 2>/dev/null; killall -9 chromium 2>/dev/null; rm -f /root/visit_status.json /root/visit.log; echo "Cleaned"', 8000);
        })
      );

      // Step 1.5: Start local proxy relay on each server
      await Promise.all(
        serverList.map(async (server) => {
          await runSSHCommand(server, 'kill -9 $(pgrep -f "proxy_relay.py") 2>/dev/null; sleep 0.5; nohup python3 /root/proxy_relay.py > /root/relay.log 2>&1 & sleep 1; echo "Relay started"', 8000);
        })
      );

      // Step 2: Start at MAX SPEED - no time limit, stops when target reached
      const captchaArg = captchaApiKey || '';
      const results = await Promise.all(
        serverList.map(async (server) => {
          let startCmd;
          if (proxies && proxies.length > 0) {
            const proxyB64 = Buffer.from(JSON.stringify(proxies)).toString('base64');
            startCmd = `echo "${proxyB64}" | base64 -d > /root/proxies.json && nohup python3 /root/visit.py "${url}" ${perServer} /root/proxies.json "${captchaArg}" > /root/visit.log 2>&1 & echo "Started PID=$!"`;
          } else {
            startCmd = `nohup python3 /root/visit.py "${url}" ${perServer} "" "${captchaArg}" > /root/visit.log 2>&1 & echo "Started PID=$!"`;
          }
          const r = await runSSHCommand(server, startCmd, 10000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'stop') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; kill -9 $(pgrep -f "proxy_relay.py") 2>/dev/null; killall -9 chrome 2>/dev/null; killall -9 chromium 2>/dev/null; rm -f /root/visit_status.json; echo "Stopped"', 10000);
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
