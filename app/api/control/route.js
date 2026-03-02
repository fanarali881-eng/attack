import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '167.172.51.232', username: 'root' },
  { host: '167.99.90.211', username: 'root' },
  { host: '46.101.86.238', username: 'root' },
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMsIHRpbWUsIHJhbmRvbSwgdGhyZWFkaW5nLCBqc29uLCBvcwoKdmlzaXRfY291bnQgPSAwCmVycm9yX2NvdW50ID0gMApsb2NrID0gdGhyZWFkaW5nLkxvY2soKQpTVEFUVVNfRklMRSA9ICIvcm9vdC92aXNpdF9zdGF0dXMuanNvbiIKClVTRVJfQUdFTlRTID0gWwogICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjIuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMS4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMS4wOyBXaW42NDsgeDY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIFNhZmFyaS81MzcuMzYnLAogICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjIuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NDsgcnY6MTIzLjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvMTIzLjAnLAogICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgVmVyc2lvbi8xNy4yIFNhZmFyaS82MDUuMS4xNScsCiAgICAnTW96aWxsYS81LjAgKGlQaG9uZTsgQ1BVIGlQaG9uZSBPUyAxN18zIGxpa2UgTWFjIE9TIFgpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgVmVyc2lvbi8xNy4yIE1vYmlsZS8xNUUxNDggU2FmYXJpLzYwNC4xJywKICAgICdNb3ppbGxhLzUuMCAoTGludXg7IEFuZHJvaWQgMTQ7IFNNLVM5MThCKSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTIyLjAuMC4wIE1vYmlsZSBTYWZhcmkvNTM3LjM2JywKICAgICdNb3ppbGxhLzUuMCAoaVBhZDsgQ1BVIE9TIDE3XzMgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjIgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjIuMC4wLjAgU2FmYXJpLzUzNy4zNiBFZGcvMTIyLjAuMC4wJywKXQoKZGVmIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIHN0YXJ0X3RpbWUsIHN0YXR1cz0icnVubmluZyIpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICBwcm9ncmVzcyA9IG1pbigxMDAsIHJvdW5kKCh2aXNpdF9jb3VudCAvIG1heF92aXNpdG9ycykgKiAxMDAsIDEpKSBpZiBtYXhfdmlzaXRvcnMgPiAwIGVsc2UgMAogICAgZGF0YSA9IHsKICAgICAgICAic3RhdHVzIjogc3RhdHVzLAogICAgICAgICJ2aXNpdHMiOiB2aXNpdF9jb3VudCwKICAgICAgICAidGFyZ2V0IjogbWF4X3Zpc2l0b3JzLAogICAgICAgICJwcm9ncmVzcyI6IHByb2dyZXNzLAogICAgICAgICJlbGFwc2VkIjogZWxhcHNlZCwKICAgICAgICAiZXJyb3JzIjogZXJyb3JfY291bnQsCiAgICAgICAgInRpbWVzdGFtcCI6IGludCh0aW1lLnRpbWUoKSkKICAgIH0KICAgIHRyeToKICAgICAgICB3aXRoIG9wZW4oU1RBVFVTX0ZJTEUsICJ3IikgYXMgZjoKICAgICAgICAgICAganNvbi5kdW1wKGRhdGEsIGYpCiAgICBleGNlcHQ6CiAgICAgICAgcGFzcwoKZGVmIGNyZWF0ZV9icm93c2VyKHByb3h5PU5vbmUpOgogICAgY28gPSBDaHJvbWl1bU9wdGlvbnMoKQogICAgY28uaGVhZGxlc3MoKQogICAgY28uYXV0b19wb3J0KCkKICAgIGNvLnNldF9hcmd1bWVudCgnLS1uby1zYW5kYm94JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWdwdScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1kZXYtc2htLXVzYWdlJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWV4dGVuc2lvbnMnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLWZpcnN0LXJ1bicpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbXV0ZS1hdWRpbycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tYmxpbmstc2V0dGluZ3M9aW1hZ2VzRW5hYmxlZD1mYWxzZScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tanMtZmxhZ3M9LS1tYXgtb2xkLXNwYWNlLXNpemU9MTI4JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLXNvZnR3YXJlLXJhc3Rlcml6ZXInKQogICAgCiAgICB1YSA9IHJhbmRvbS5jaG9pY2UoVVNFUl9BR0VOVFMpCiAgICBjby5zZXRfdXNlcl9hZ2VudCh1YSkKICAgIAogICAgaWYgcHJveHk6CiAgICAgICAgY28uc2V0X2FyZ3VtZW50KGYnLS1wcm94eS1zZXJ2ZXI9e3Byb3h5WyJob3N0Il19Ontwcm94eVsicG9ydCJdfScpCiAgICAKICAgIHRyeToKICAgICAgICBwYWdlID0gQ2hyb21pdW1QYWdlKGFkZHJfb3Jfb3B0cz1jbykKICAgICAgICByZXR1cm4gcGFnZQogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIHByaW50KGYiQnJvd3NlciBlcnJvcjoge2V9IiwgZmx1c2g9VHJ1ZSkKICAgICAgICByZXR1cm4gTm9uZQoKZGVmIHdvcmtlcih3aWQsIHRhcmdldF91cmwsIG1heF92aXNpdHMsIHN0YXJ0X3RpbWUsIHByb3hpZXMpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgCiAgICB2aXNpdHNfdGhpc19icm93c2VyID0gMAogICAgbWF4X3Blcl9icm93c2VyID0gcmFuZG9tLnJhbmRpbnQoMjUsIDQwKQogICAgcGFnZSA9IE5vbmUKICAgIAogICAgd2hpbGUgVHJ1ZToKICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgIGlmIHZpc2l0X2NvdW50ID49IG1heF92aXNpdHM6CiAgICAgICAgICAgICAgICBicmVhawogICAgICAgIAogICAgICAgIGlmIHBhZ2UgaXMgTm9uZSBvciB2aXNpdHNfdGhpc19icm93c2VyID49IG1heF9wZXJfYnJvd3NlcjoKICAgICAgICAgICAgaWYgcGFnZToKICAgICAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgICAgICBwYWdlLnF1aXQoKQogICAgICAgICAgICAgICAgZXhjZXB0OgogICAgICAgICAgICAgICAgICAgIHBhc3MKICAgICAgICAgICAgcHJveHkgPSByYW5kb20uY2hvaWNlKHByb3hpZXMpIGlmIHByb3hpZXMgZWxzZSBOb25lCiAgICAgICAgICAgIHBhZ2UgPSBjcmVhdGVfYnJvd3Nlcihwcm94eSkKICAgICAgICAgICAgaWYgcGFnZSBpcyBOb25lOgogICAgICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMSkKICAgICAgICAgICAgICAgIGNvbnRpbnVlCiAgICAgICAgICAgIHZpc2l0c190aGlzX2Jyb3dzZXIgPSAwCiAgICAgICAgICAgIG1heF9wZXJfYnJvd3NlciA9IHJhbmRvbS5yYW5kaW50KDI1LCA0MCkKICAgICAgICAKICAgICAgICB0cnk6CiAgICAgICAgICAgIHBhZ2UuZ2V0KHRhcmdldF91cmwpCiAgICAgICAgICAgIHRpbWUuc2xlZXAocmFuZG9tLnVuaWZvcm0oMC4yLCAwLjgpKQogICAgICAgICAgICAKICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgaWYgdmlzaXRfY291bnQgPCBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgICAgIHZpc2l0X2NvdW50ICs9IDEKICAgICAgICAgICAgICAgICAgICBjdXJyZW50ID0gdmlzaXRfY291bnQKICAgICAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgCiAgICAgICAgICAgIHZpc2l0c190aGlzX2Jyb3dzZXIgKz0gMQogICAgICAgICAgICAKICAgICAgICAgICAgaWYgY3VycmVudCAlIDUgPT0gMDoKICAgICAgICAgICAgICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgICAgICAgICAKICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgcGFnZS5xdWl0KCkKICAgICAgICAgICAgZXhjZXB0OgogICAgICAgICAgICAgICAgcGFzcwogICAgICAgICAgICBwYWdlID0gTm9uZQogICAgICAgICAgICB0aW1lLnNsZWVwKDAuNSkKICAgIAogICAgaWYgcGFnZToKICAgICAgICB0cnk6CiAgICAgICAgICAgIHBhZ2UucXVpdCgpCiAgICAgICAgZXhjZXB0OgogICAgICAgICAgICBwYXNzCgpkZWYgcnVuX2F0dGFjayh0YXJnZXRfdXJsLCBtYXhfdmlzaXRvcnM9MTAwLCBwcm94aWVzPU5vbmUpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgdmlzaXRfY291bnQgPSAwCiAgICBlcnJvcl9jb3VudCA9IDAKCiAgICBudW1fdGhyZWFkcyA9IG1pbigxNSwgbWF4KDMsIG1heF92aXNpdG9ycyAvLyAxMCkpCgogICAgc3RhcnRfdGltZSA9IHRpbWUudGltZSgpCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBzdGFydF90aW1lLCAic3RhcnRpbmciKQoKICAgIHByb3h5X2luZm8gPSBmIiB8IFByb3hpZXM6IHtsZW4ocHJveGllcyl9IiBpZiBwcm94aWVzIGVsc2UgIiB8IE5vIHByb3h5IgogICAgcHJpbnQoZiJTdGFydGluZzoge21heF92aXNpdG9yc30gdmlzaXRvcnMgfCB7bnVtX3RocmVhZHN9IHRocmVhZHN7cHJveHlfaW5mb30gfCBNQVggU1BFRUQiLCBmbHVzaD1UcnVlKQoKICAgIHRocmVhZHMgPSBbXQogICAgZm9yIGkgaW4gcmFuZ2UobnVtX3RocmVhZHMpOgogICAgICAgIHQgPSB0aHJlYWRpbmcuVGhyZWFkKHRhcmdldD13b3JrZXIsIGFyZ3M9KGksIHRhcmdldF91cmwsIG1heF92aXNpdG9ycywgc3RhcnRfdGltZSwgcHJveGllcyBvciBbXSkpCiAgICAgICAgdC5kYWVtb24gPSBUcnVlCiAgICAgICAgdC5zdGFydCgpCiAgICAgICAgdGhyZWFkcy5hcHBlbmQodCkKICAgICAgICB0aW1lLnNsZWVwKDAuNSkKCiAgICB3aGlsZSBhbnkodC5pc19hbGl2ZSgpIGZvciB0IGluIHRocmVhZHMpOgogICAgICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIHN0YXJ0X3RpbWUsICJydW5uaW5nIikKICAgICAgICB0aW1lLnNsZWVwKDIpCgogICAgZm9yIHQgaW4gdGhyZWFkczoKICAgICAgICB0LmpvaW4odGltZW91dD01KQoKICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIHN0YXJ0X3RpbWUsICJmaW5pc2hlZCIpCiAgICBwcmludChmIkZpbmlzaGVkISBUb3RhbDoge3Zpc2l0X2NvdW50fSB2aXNpdHMgfCBFcnJvcnM6IHtlcnJvcl9jb3VudH0iLCBmbHVzaD1UcnVlKQoKaWYgX19uYW1lX18gPT0gIl9fbWFpbl9fIjoKICAgIHVybCA9IHN5cy5hcmd2WzFdIGlmIGxlbihzeXMuYXJndikgPiAxIGVsc2UgImh0dHA6Ly9leGFtcGxlLmNvbSIKICAgIHZpc2l0b3JzID0gaW50KHN5cy5hcmd2WzJdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMiBlbHNlIDEwMAogICAgcHJveHlfZmlsZSA9IHN5cy5hcmd2WzNdIGlmIGxlbihzeXMuYXJndikgPiAzIGVsc2UgTm9uZQoKICAgIHByb3hpZXMgPSBbXQogICAgaWYgcHJveHlfZmlsZToKICAgICAgICB0cnk6CiAgICAgICAgICAgIHdpdGggb3Blbihwcm94eV9maWxlLCAncicpIGFzIGY6CiAgICAgICAgICAgICAgICBwcm94aWVzID0ganNvbi5sb2FkKGYpCiAgICAgICAgICAgIHByaW50KGYiTG9hZGVkIHtsZW4ocHJveGllcyl9IHByb3hpZXMiLCBmbHVzaD1UcnVlKQogICAgICAgIGV4Y2VwdDoKICAgICAgICAgICAgcHJpbnQoIkZhaWxlZCB0byBsb2FkIHByb3hpZXMiLCBmbHVzaD1UcnVlKQoKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycywgcHJveGllcyBpZiBwcm94aWVzIGVsc2UgTm9uZSkK";

const SETUP_COMMAND = 'export DEBIAN_FRONTEND=noninteractive && apt-get update -y && apt-get install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 fonts-liberation xdg-utils && (apt-get install -y libasound2 2>/dev/null || apt-get install -y libasound2t64 2>/dev/null || true) && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt-get install -y ./google-chrome-stable_current_amd64.deb 2>/dev/null; rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage --break-system-packages 2>/dev/null || pip3 install DrissionPage && echo SETUP_COMPLETE';

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
    const { action, url, visitors, duration, servers, proxies } = await req.json();
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
      const command = `echo "${PYTHON_SCRIPT_B64}" | base64 -d > /root/visit.py && echo "Script deployed"`;
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, command, 10000);
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
          await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; killall -9 chrome 2>/dev/null; killall -9 chromium 2>/dev/null; rm -f /root/visit_status.json /root/visit.log; echo "Cleaned"', 8000);
        })
      );

      // Step 2: Deploy latest script
      await Promise.all(
        serverList.map(async (server) => {
          await runSSHCommand(server, `echo "${PYTHON_SCRIPT_B64}" | base64 -d > /root/visit.py && echo "Deployed"`, 8000);
        })
      );

      // Step 3: Start at MAX SPEED - no time limit, stops when target reached
      const results = await Promise.all(
        serverList.map(async (server) => {
          let startCmd;
          if (proxies && proxies.length > 0) {
            const proxyB64 = Buffer.from(JSON.stringify(proxies)).toString('base64');
            startCmd = `echo "${proxyB64}" | base64 -d > /root/proxies.json && nohup python3 /root/visit.py "${url}" ${perServer} /root/proxies.json > /root/visit.log 2>&1 & echo "Started PID=$!"`;
          } else {
            startCmd = `nohup python3 /root/visit.py "${url}" ${perServer} > /root/visit.log 2>&1 & echo "Started PID=$!"`;
          }
          const r = await runSSHCommand(server, startCmd, 10000);
          return { host: server.host, ...r };
        })
      );
      return NextResponse.json({ results });

    } else if (action === 'stop') {
      const results = await Promise.all(
        serverList.map(async (server) => {
          const r = await runSSHCommand(server, 'kill -9 $(pgrep -f "visit.py") 2>/dev/null; killall -9 chrome 2>/dev/null; killall -9 chromium 2>/dev/null; rm -f /root/visit_status.json; echo "Stopped"', 10000);
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
