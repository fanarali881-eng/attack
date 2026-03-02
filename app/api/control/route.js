import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQppbXBvcnQgdGhyZWFkaW5nCmltcG9ydCBqc29uCgp2aXNpdF9jb3VudCA9IDAKZXJyb3JfY291bnQgPSAwCmxvY2sgPSB0aHJlYWRpbmcuTG9jaygpClNUQVRVU19GSUxFID0gIi9yb290L3Zpc2l0X3N0YXR1cy5qc29uIgoKZGVmIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsIHN0YXR1cz0icnVubmluZyIpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICB0b3RhbF9zZWNvbmRzID0gZHVyYXRpb25fbWludXRlcyAqIDYwCiAgICByZW1haW5pbmcgPSBtYXgoMCwgdG90YWxfc2Vjb25kcyAtIGVsYXBzZWQpCiAgICBwcm9ncmVzcyA9IG1pbigxMDAsIHJvdW5kKCh2aXNpdF9jb3VudCAvIG1heF92aXNpdG9ycykgKiAxMDAsIDEpKSBpZiBtYXhfdmlzaXRvcnMgPiAwIGVsc2UgMAogICAgZGF0YSA9IHsKICAgICAgICAic3RhdHVzIjogc3RhdHVzLAogICAgICAgICJ2aXNpdHMiOiB2aXNpdF9jb3VudCwKICAgICAgICAidGFyZ2V0IjogbWF4X3Zpc2l0b3JzLAogICAgICAgICJwcm9ncmVzcyI6IHByb2dyZXNzLAogICAgICAgICJlbGFwc2VkIjogZWxhcHNlZCwKICAgICAgICAicmVtYWluaW5nIjogcmVtYWluaW5nLAogICAgICAgICJlcnJvcnMiOiBlcnJvcl9jb3VudCwKICAgICAgICAidGltZXN0YW1wIjogaW50KHRpbWUudGltZSgpKQogICAgfQogICAgdHJ5OgogICAgICAgIHdpdGggb3BlbihTVEFUVVNfRklMRSwgInciKSBhcyBmOgogICAgICAgICAgICBqc29uLmR1bXAoZGF0YSwgZikKICAgIGV4Y2VwdDoKICAgICAgICBwYXNzCgpkZWYgY3JlYXRlX2Jyb3dzZXIocHJveHk9Tm9uZSk6CiAgICBjbyA9IENocm9taXVtT3B0aW9ucygpCiAgICBjby5zZXRfYXJndW1lbnQoJy0taGVhZGxlc3M9bmV3JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1uby1zYW5kYm94JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWdwdScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1pbWFnZXMnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtamF2YXNjcmlwdCcpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1leHRlbnNpb25zJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWRldi1zaG0tdXNhZ2UnKQogICAgaWYgcHJveHk6CiAgICAgICAgY28uc2V0X2FyZ3VtZW50KGYnLS1wcm94eS1zZXJ2ZXI9e3Byb3h5WyJob3N0Il19Ontwcm94eVsicG9ydCJdfScpCiAgICBhZ2VudHMgPSBbCiAgICAgICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjAuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAgICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMTkuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAgICAgJ01vemlsbGEvNS4wIChYMTE7IExpbnV4IHg4Nl82NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzExOC4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NDsgcnY6MTA5LjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvMTE5LjAnLAogICAgICAgICdNb3ppbGxhLzUuMCAoaVBob25lOyBDUFUgaVBob25lIE9TIDE3XzAgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjAgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgXQogICAgY28uc2V0X3VzZXJfYWdlbnQocmFuZG9tLmNob2ljZShhZ2VudHMpKQogICAgcmV0dXJuIENocm9taXVtUGFnZShhZGRyX29yX29wdHM9Y28pCgpkZWYgd29ya2VyKHRhcmdldF91cmwsIG1heF92aXNpdHMsIGVuZF90aW1lLCBkZWxheSwgc3RhcnRfdGltZSwgZHVyYXRpb25fbWludXRlcywgcHJveGllcyk6CiAgICBnbG9iYWwgdmlzaXRfY291bnQsIGVycm9yX2NvdW50CiAgICB0cnk6CiAgICAgICAgcHJveHkgPSByYW5kb20uY2hvaWNlKHByb3hpZXMpIGlmIHByb3hpZXMgZWxzZSBOb25lCiAgICAgICAgcGFnZSA9IGNyZWF0ZV9icm93c2VyKHByb3h5KQogICAgICAgIHdoaWxlIHRpbWUudGltZSgpIDwgZW5kX3RpbWU6CiAgICAgICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgICAgIGlmIHZpc2l0X2NvdW50ID49IG1heF92aXNpdHM6CiAgICAgICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgICAgIHZpc2l0X2NvdW50ICs9IDEKICAgICAgICAgICAgICAgIGN1cnJlbnQgPSB2aXNpdF9jb3VudAogICAgICAgICAgICB0cnk6CiAgICAgICAgICAgICAgICB0YWIgPSBwYWdlLm5ld190YWIodGFyZ2V0X3VybCkKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoZGVsYXkpCiAgICAgICAgICAgICAgICB0YWIuY2xvc2UoKQogICAgICAgICAgICAgICAgaWYgY3VycmVudCAlIDUwID09IDA6CiAgICAgICAgICAgICAgICAgICAgd3JpdGVfc3RhdHVzKG1heF92aXNpdHMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsICJydW5uaW5nIikKICAgICAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMC41KQogICAgICAgIHBhZ2UucXVpdCgpCiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICBlcnJvcl9jb3VudCArPSAxCgpkZWYgcnVuX2F0dGFjayh0YXJnZXRfdXJsLCBtYXhfdmlzaXRvcnM9MTAwLCBkdXJhdGlvbl9taW51dGVzPTUsIHByb3hpZXM9Tm9uZSk6CiAgICBnbG9iYWwgdmlzaXRfY291bnQsIGVycm9yX2NvdW50CiAgICB2aXNpdF9jb3VudCA9IDAKICAgIGVycm9yX2NvdW50ID0gMAoKICAgIHRvdGFsX3NlY29uZHMgPSBkdXJhdGlvbl9taW51dGVzICogNjAKICAgIHZpc2l0c19wZXJfc2Vjb25kX25lZWRlZCA9IG1heF92aXNpdG9ycyAvIHRvdGFsX3NlY29uZHMKICAgIG51bV90aHJlYWRzID0gbWF4KDIsIG1pbihpbnQodmlzaXRzX3Blcl9zZWNvbmRfbmVlZGVkIC8gMikgKyAxLCAyMCkpCiAgICBkZWxheSA9IG1heCgwLjEsICh0b3RhbF9zZWNvbmRzICogbnVtX3RocmVhZHMpIC8gbWF4X3Zpc2l0b3JzKQoKICAgIHN0YXJ0X3RpbWUgPSB0aW1lLnRpbWUoKQogICAgd3JpdGVfc3RhdHVzKG1heF92aXNpdG9ycywgZHVyYXRpb25fbWludXRlcywgc3RhcnRfdGltZSwgInN0YXJ0aW5nIikKCiAgICBwcm94eV9pbmZvID0gZiIgfCBQcm94aWVzOiB7bGVuKHByb3hpZXMpfSIgaWYgcHJveGllcyBlbHNlICIgfCBObyBwcm94eSIKICAgIHByaW50KGYiU3RhcnRpbmc6IHttYXhfdmlzaXRvcnN9IHZpc2l0b3JzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW4gfCB7bnVtX3RocmVhZHN9IHRocmVhZHMgfCBkZWxheToge2RlbGF5Oi4yZn1ze3Byb3h5X2luZm99IikKCiAgICBlbmRfdGltZSA9IHRpbWUudGltZSgpICsgdG90YWxfc2Vjb25kcwogICAgdGhyZWFkcyA9IFtdCiAgICBmb3IgaSBpbiByYW5nZShudW1fdGhyZWFkcyk6CiAgICAgICAgdCA9IHRocmVhZGluZy5UaHJlYWQodGFyZ2V0PXdvcmtlciwgYXJncz0odGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzLCBlbmRfdGltZSwgZGVsYXksIHN0YXJ0X3RpbWUsIGR1cmF0aW9uX21pbnV0ZXMsIHByb3hpZXMgb3IgW10pKQogICAgICAgIHQuZGFlbW9uID0gVHJ1ZQogICAgICAgIHQuc3RhcnQoKQogICAgICAgIHRocmVhZHMuYXBwZW5kKHQpCiAgICAgICAgdGltZS5zbGVlcCgwLjUpCgogICAgd2hpbGUgYW55KHQuaXNfYWxpdmUoKSBmb3IgdCBpbiB0aHJlYWRzKToKICAgICAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgdGltZS5zbGVlcCgyKQoKICAgIGZvciB0IGluIHRocmVhZHM6CiAgICAgICAgdC5qb2luKHRpbWVvdXQ9NSkKCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAiZmluaXNoZWQiKQogICAgcHJpbnQoZiJGaW5pc2hlZCEgVG90YWw6IHt2aXNpdF9jb3VudH0gdmlzaXRzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW51dGVzIHwgRXJyb3JzOiB7ZXJyb3JfY291bnR9IikKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICB2aXNpdG9ycyA9IGludChzeXMuYXJndlsyXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDIgZWxzZSAxMDAKICAgIGR1cmF0aW9uID0gaW50KHN5cy5hcmd2WzNdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMyBlbHNlIDUKICAgIHByb3h5X2ZpbGUgPSBzeXMuYXJndls0XSBpZiBsZW4oc3lzLmFyZ3YpID4gNCBlbHNlIE5vbmUKCiAgICBwcm94aWVzID0gW10KICAgIGlmIHByb3h5X2ZpbGU6CiAgICAgICAgdHJ5OgogICAgICAgICAgICB3aXRoIG9wZW4ocHJveHlfZmlsZSwgJ3InKSBhcyBmOgogICAgICAgICAgICAgICAgcHJveGllcyA9IGpzb24ubG9hZChmKQogICAgICAgICAgICBwcmludChmIkxvYWRlZCB7bGVuKHByb3hpZXMpfSBwcm94aWVzIikKICAgICAgICBleGNlcHQ6CiAgICAgICAgICAgIHByaW50KCJGYWlsZWQgdG8gbG9hZCBwcm94aWVzLCBydW5uaW5nIHdpdGhvdXQgcHJveHkiKQoKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycywgZHVyYXRpb24sIHByb3hpZXMgaWYgcHJveGllcyBlbHNlIE5vbmUpCg==";

const SETUP_COMMAND = 'apt update -y && apt upgrade -y && apt install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 fonts-liberation libappindicator3-1 xdg-utils && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt install -y ./google-chrome-stable_current_amd64.deb && rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage && echo "SETUP_COMPLETE"';

async function executeOnServer(server, command, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('Connection timeout'));
    }, timeout);

    conn.on('ready', () => {
      clearTimeout(timer);
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let output = '';
        stream.on('close', () => {
          conn.end();
          resolve(output);
        }).on('data', (data) => {
          output += data;
        }).stderr.on('data', (data) => {
          output += data;
        });
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    }).connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 20000,
    });
  });
}

export async function POST(req) {
  try {
    const { action, url, visitors, duration, servers, proxies } = await req.json();
    const serverList = (servers && servers.length > 0) ? servers : DEFAULT_SERVERS;
    const results = [];

    for (const server of serverList) {
      try {
        let command = '';
        let timeout = 20000;

        if (action === 'setup') {
          command = `nohup bash -c '${SETUP_COMMAND}' > /root/setup.log 2>&1 & echo "Setup started in background"`;
          timeout = 15000;
        } else if (action === 'deploy') {
          command = `echo "${PYTHON_SCRIPT_B64}" | base64 -d > /root/visit.py && echo "Script deployed successfully"`;
        } else if (action === 'start') {
          if (!url) throw new Error("URL is required");
          const v = visitors || 100;
          const d = duration || 5;
          const proxyJson = proxies && proxies.length > 0 ? JSON.stringify(proxies).replace(/'/g, "'\''") : '';
          const proxyCmd = proxyJson ? `echo '${proxyJson}' > /root/proxies.json && ` : '';
          const proxyArg = proxyJson ? ' /root/proxies.json' : '';
          command = `${proxyCmd}nohup python3 /root/visit.py "${url}" ${v} ${d}${proxyArg} > /dev/null 2>&1 & echo "Started: ${v} visitors for ${d} minutes on ${url} (${proxies ? proxies.length : 0} proxies)"`;
        } else if (action === 'stop') {
          command = `pkill -f visit.py && echo "All processes stopped" || echo "No process found"`;
        } else {
          throw new Error("Unknown action");
        }

        const output = await executeOnServer(server, command, timeout);
        const isSuccess = action === 'setup' ? output.includes('Setup started') : true;
        results.push({
          host: server.host,
          status: isSuccess ? 'success' : 'error',
          output: action === 'setup'
            ? (isSuccess ? 'Setup started in background (takes 2-5 min)' : 'Setup failed to start.')
            : output.trim()
        });
      } catch (error) {
        results.push({ host: server.host, status: 'error', error: error.message });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
