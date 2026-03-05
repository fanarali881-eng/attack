import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '46.101.52.177', username: 'root' },
  { host: '138.68.141.40', username: 'root' },
  { host: '144.126.234.13', username: 'root' },
  { host: '161.35.167.208', username: 'root' },
  { host: '167.99.192.89', username: 'root' },
  { host: '165.22.113.176', username: 'root' },
  { host: '165.227.224.130', username: 'root' },
  { host: '68.183.33.236', username: 'root' },
  { host: '159.65.57.39', username: 'root' },
  { host: '188.166.170.15', username: 'root' },
  { host: '167.172.50.122', username: 'root' },
  { host: '138.68.154.253', username: 'root' }
];

const SETUP_COMMAND = 'export DEBIAN_FRONTEND=noninteractive && apt-get update -y && apt-get install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 fonts-liberation xdg-utils && (apt-get install -y libasound2 2>/dev/null || apt-get install -y libasound2t64 2>/dev/null || true) && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt-get install -y ./google-chrome-stable_current_amd64.deb 2>/dev/null; rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage python-socketio websocket-client "selenium>=4.40" "typing_extensions>=4.12" --break-system-packages 2>/dev/null || pip3 install DrissionPage python-socketio websocket-client "selenium>=4.40" "typing_extensions>=4.12" && echo SETUP_COMPLETE';

function buildRelayScript(proxyHost, proxyPort, proxyUser, proxyPass) {
  const lines = [
    '#!/usr/bin/env python3',
    'import asyncio, base64, random, string',
    'PROXY_HOST = "' + proxyHost + '"',
    'PROXY_PORT = ' + proxyPort,
    'PROXY_USER = "' + proxyUser + '"',
    'PROXY_PASS = "' + proxyPass + '"',
    'LISTEN_PORT = 18080',
    'LISTEN_HOST = "0.0.0.0"',
    'BUFFER_SIZE = 65536',
    'def get_session_auth():',
    '    sid = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))',
    '    pw = f"{PROXY_PASS}_session-{sid}"',
    '    return base64.b64encode(f"{PROXY_USER}:{pw}".encode()).decode()',
    'async def pipe(r, w):',
    '    try:',
    '        while True:',
    '            data = await asyncio.wait_for(r.read(BUFFER_SIZE), timeout=60)',
    '            if not data: break',
    '            w.write(data)',
    '            await w.drain()',
    '    except: pass',
    'async def handle_client(cr, cw):',
    '    pw = None',
    '    try:',
    '        req = b""',
    '        while b"\\r\\n\\r\\n" not in req:',
    '            chunk = await asyncio.wait_for(cr.read(BUFFER_SIZE), timeout=15)',
    '            if not chunk: cw.close(); return',
    '            req += chunk',
    '        first = req.split(b"\\r\\n")[0].decode()',
    '        method = first.split()[0]',
    '        auth = get_session_auth()',
    '        pr, pw = await asyncio.wait_for(asyncio.open_connection(PROXY_HOST, PROXY_PORT), timeout=10)',
    '        if method == "CONNECT":',
    '            target = first.split()[1]',
    '            pw.write(f"CONNECT {target} HTTP/1.1\\r\\nHost: {target}\\r\\nProxy-Authorization: Basic {auth}\\r\\nProxy-Connection: keep-alive\\r\\n\\r\\n".encode())',
    '            await pw.drain()',
    '            resp = b""',
    '            while b"\\r\\n\\r\\n" not in resp:',
    '                chunk = await asyncio.wait_for(pr.read(BUFFER_SIZE), timeout=10)',
    '                if not chunk: break',
    '                resp += chunk',
    '            if b"200" in resp.split(b"\\r\\n")[0]:',
    '                cw.write(b"HTTP/1.1 200 Connection Established\\r\\n\\r\\n")',
    '                await cw.drain()',
    '                await asyncio.gather(pipe(cr, pw), pipe(pr, cw))',
    '            else:',
    '                cw.write(resp)',
    '                await cw.drain()',
    '        else:',
    '            lines2 = req.split(b"\\r\\n")',
    '            new_lines = [lines2[0]]',
    '            for line in lines2[1:]:',
    '                if line.lower().startswith(b"proxy-authorization"): continue',
    '                new_lines.append(line)',
    '            new_lines.insert(1, f"Proxy-Authorization: Basic {auth}".encode())',
    '            pw.write(b"\\r\\n".join(new_lines))',
    '            await pw.drain()',
    '            while True:',
    '                data = await asyncio.wait_for(pr.read(BUFFER_SIZE), timeout=30)',
    '                if not data: break',
    '                cw.write(data)',
    '                await cw.drain()',
    '    except: pass',
    '    finally:',
    '        try: cw.close()',
    '        except: pass',
    '        try:',
    '            if pw: pw.close()',
    '        except: pass',
    'async def main():',
    '    server = await asyncio.start_server(handle_client, LISTEN_HOST, LISTEN_PORT, limit=BUFFER_SIZE, backlog=1024)',
    '    print(f"Relay on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)',
    '    async with server: await server.serve_forever()',
    'if __name__ == "__main__": asyncio.run(main())',
  ];
  return lines.join('\n');
}

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
      const perServer = Math.ceil(totalVisitors / serverCount);

      // Step 1: Kill old processes and clean up
      await Promise.all(
        serverList.map(async (server) => {
          await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; kill -9 $(pgrep -f "proxy_relay.py") 2>/dev/null; killall -9 chrome 2>/dev/null; killall -9 chromium 2>/dev/null; fuser -k 18080/tcp 2>/dev/null; sleep 1; fuser -k 18080/tcp 2>/dev/null; rm -f /root/visit_status.json /root/visit.log; echo "Cleaned"', 10000);
        })
      );

      // Step 1.5: Deploy fresh proxy_relay.py with current proxy creds from dashboard
      const proxyConfig = (proxies && proxies.length > 0) ? proxies[0] : null;
      if (proxyConfig) {
        const relayScript = buildRelayScript(proxyConfig.host, proxyConfig.port, proxyConfig.username, proxyConfig.password);
        const relayB64 = Buffer.from(relayScript).toString('base64');
        await Promise.all(
          serverList.map(async (server) => {
            await runSSHCommand(server, 'fuser -k 18080/tcp 2>/dev/null; sleep 1; echo "' + relayB64 + '" | base64 -d > /root/proxy_relay.py && nohup python3 /root/proxy_relay.py > /root/relay.log 2>&1 & sleep 2 && ss -tlnp | grep -q 18080 && echo "Relay OK" || echo "Relay FAIL"', 12000);
          })
        );
      }

      // Step 2: Start attack
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
