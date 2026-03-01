import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQppbXBvcnQgdGhyZWFkaW5nCmltcG9ydCBqc29uCgp2aXNpdF9jb3VudCA9IDAKZXJyb3JfY291bnQgPSAwCmxvY2sgPSB0aHJlYWRpbmcuTG9jaygpClNUQVRVU19GSUxFID0gIi9yb290L3Zpc2l0X3N0YXR1cy5qc29uIgoKZGVmIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsIHN0YXR1cz0icnVubmluZyIpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICB0b3RhbF9zZWNvbmRzID0gZHVyYXRpb25fbWludXRlcyAqIDYwCiAgICByZW1haW5pbmcgPSBtYXgoMCwgdG90YWxfc2Vjb25kcyAtIGVsYXBzZWQpCiAgICBwcm9ncmVzcyA9IG1pbigxMDAsIHJvdW5kKCh2aXNpdF9jb3VudCAvIG1heF92aXNpdG9ycykgKiAxMDAsIDEpKSBpZiBtYXhfdmlzaXRvcnMgPiAwIGVsc2UgMAogICAgZGF0YSA9IHsKICAgICAgICAic3RhdHVzIjogc3RhdHVzLAogICAgICAgICJ2aXNpdHMiOiB2aXNpdF9jb3VudCwKICAgICAgICAidGFyZ2V0IjogbWF4X3Zpc2l0b3JzLAogICAgICAgICJwcm9ncmVzcyI6IHByb2dyZXNzLAogICAgICAgICJlbGFwc2VkIjogZWxhcHNlZCwKICAgICAgICAicmVtYWluaW5nIjogcmVtYWluaW5nLAogICAgICAgICJlcnJvcnMiOiBlcnJvcl9jb3VudCwKICAgICAgICAidGltZXN0YW1wIjogaW50KHRpbWUudGltZSgpKQogICAgfQogICAgdHJ5OgogICAgICAgIHdpdGggb3BlbihTVEFUVVNfRklMRSwgInciKSBhcyBmOgogICAgICAgICAgICBqc29uLmR1bXAoZGF0YSwgZikKICAgIGV4Y2VwdDoKICAgICAgICBwYXNzCgpkZWYgY3JlYXRlX2Jyb3dzZXIoKToKICAgIGNvID0gQ2hyb21pdW1PcHRpb25zKCkKICAgIGNvLnNldF9hcmd1bWVudCgnLS1oZWFkbGVzcz1uZXcnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLXNhbmRib3gnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZ3B1JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWltYWdlcycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1qYXZhc2NyaXB0JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWV4dGVuc2lvbnMnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZGV2LXNobS11c2FnZScpCiAgICBhZ2VudHMgPSBbCiAgICAgICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjAuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAgICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMTkuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAgICAgJ01vemlsbGEvNS4wIChYMTE7IExpbnV4IHg4Nl82NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzExOC4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NDsgcnY6MTA5LjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvMTE5LjAnLAogICAgICAgICdNb3ppbGxhLzUuMCAoaVBob25lOyBDUFUgaVBob25lIE9TIDE3XzAgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjAgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgXQogICAgY28uc2V0X3VzZXJfYWdlbnQocmFuZG9tLmNob2ljZShhZ2VudHMpKQogICAgcmV0dXJuIENocm9taXVtUGFnZShhZGRyX29yX29wdHM9Y28pCgpkZWYgd29ya2VyKHRhcmdldF91cmwsIG1heF92aXNpdHMsIGVuZF90aW1lLCBkZWxheSwgc3RhcnRfdGltZSwgZHVyYXRpb25fbWludXRlcyk6CiAgICBnbG9iYWwgdmlzaXRfY291bnQsIGVycm9yX2NvdW50CiAgICB0cnk6CiAgICAgICAgcGFnZSA9IGNyZWF0ZV9icm93c2VyKCkKICAgICAgICB3aGlsZSB0aW1lLnRpbWUoKSA8IGVuZF90aW1lOgogICAgICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgICAgICBpZiB2aXNpdF9jb3VudCA+PSBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgICAgICB2aXNpdF9jb3VudCArPSAxCiAgICAgICAgICAgICAgICBjdXJyZW50ID0gdmlzaXRfY291bnQKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgdGFiID0gcGFnZS5uZXdfdGFiKHRhcmdldF91cmwpCiAgICAgICAgICAgICAgICB0aW1lLnNsZWVwKGRlbGF5KQogICAgICAgICAgICAgICAgdGFiLmNsb3NlKCkKICAgICAgICAgICAgICAgIGlmIGN1cnJlbnQgJSA1MCA9PSAwOgogICAgICAgICAgICAgICAgICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgICAgICAgICBlcnJvcl9jb3VudCArPSAxCiAgICAgICAgICAgICAgICB0aW1lLnNsZWVwKDAuNSkKICAgICAgICBwYWdlLnF1aXQoKQogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgZXJyb3JfY291bnQgKz0gMQoKZGVmIHJ1bl9hdHRhY2sodGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzPTEwMCwgZHVyYXRpb25fbWludXRlcz01KToKICAgIGdsb2JhbCB2aXNpdF9jb3VudCwgZXJyb3JfY291bnQKICAgIHZpc2l0X2NvdW50ID0gMAogICAgZXJyb3JfY291bnQgPSAwCgogICAgdG90YWxfc2Vjb25kcyA9IGR1cmF0aW9uX21pbnV0ZXMgKiA2MAogICAgdmlzaXRzX3Blcl9zZWNvbmRfbmVlZGVkID0gbWF4X3Zpc2l0b3JzIC8gdG90YWxfc2Vjb25kcwogICAgbnVtX3RocmVhZHMgPSBtYXgoMiwgbWluKGludCh2aXNpdHNfcGVyX3NlY29uZF9uZWVkZWQgLyAyKSArIDEsIDIwKSkKICAgIGRlbGF5ID0gbWF4KDAuMSwgKHRvdGFsX3NlY29uZHMgKiBudW1fdGhyZWFkcykgLyBtYXhfdmlzaXRvcnMpCgogICAgc3RhcnRfdGltZSA9IHRpbWUudGltZSgpCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAic3RhcnRpbmciKQoKICAgIHByaW50KGYiU3RhcnRpbmc6IHttYXhfdmlzaXRvcnN9IHZpc2l0b3JzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW4gfCB7bnVtX3RocmVhZHN9IHRocmVhZHMgfCBkZWxheToge2RlbGF5Oi4yZn1zIikKCiAgICBlbmRfdGltZSA9IHRpbWUudGltZSgpICsgdG90YWxfc2Vjb25kcwogICAgdGhyZWFkcyA9IFtdCiAgICBmb3IgaSBpbiByYW5nZShudW1fdGhyZWFkcyk6CiAgICAgICAgdCA9IHRocmVhZGluZy5UaHJlYWQodGFyZ2V0PXdvcmtlciwgYXJncz0odGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzLCBlbmRfdGltZSwgZGVsYXksIHN0YXJ0X3RpbWUsIGR1cmF0aW9uX21pbnV0ZXMpKQogICAgICAgIHQuZGFlbW9uID0gVHJ1ZQogICAgICAgIHQuc3RhcnQoKQogICAgICAgIHRocmVhZHMuYXBwZW5kKHQpCiAgICAgICAgdGltZS5zbGVlcCgwLjUpCgogICAgIyBTdGF0dXMgdXBkYXRlcgogICAgd2hpbGUgYW55KHQuaXNfYWxpdmUoKSBmb3IgdCBpbiB0aHJlYWRzKToKICAgICAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgdGltZS5zbGVlcCgyKQoKICAgIGZvciB0IGluIHRocmVhZHM6CiAgICAgICAgdC5qb2luKHRpbWVvdXQ9NSkKCiAgICB3cml0ZV9zdGF0dXMobWF4X3Zpc2l0b3JzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAiZmluaXNoZWQiKQogICAgcHJpbnQoZiJGaW5pc2hlZCEgVG90YWw6IHt2aXNpdF9jb3VudH0gdmlzaXRzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW51dGVzIHwgRXJyb3JzOiB7ZXJyb3JfY291bnR9IikKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICB2aXNpdG9ycyA9IGludChzeXMuYXJndlsyXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDIgZWxzZSAxMDAKICAgIGR1cmF0aW9uID0gaW50KHN5cy5hcmd2WzNdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMyBlbHNlIDUKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycywgZHVyYXRpb24pCg==";

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
    const { action, url, visitors, duration, servers } = await req.json();
    const serverList = (servers && servers.length > 0) ? servers : DEFAULT_SERVERS;
    const results = [];

    for (const server of serverList) {
      try {
        let command = '';
        let timeout = 20000;

        if (action === 'setup') {
          command = SETUP_COMMAND;
          timeout = 300000;
        } else if (action === 'deploy') {
          command = `echo "${PYTHON_SCRIPT_B64}" | base64 -d > /root/visit.py && echo "Script deployed successfully"`;
        } else if (action === 'start') {
          if (!url) throw new Error("URL is required");
          const v = visitors || 100;
          const d = duration || 5;
          command = `nohup python3 /root/visit.py "${url}" ${v} ${d} > /dev/null 2>&1 & echo "Started: ${v} visitors for ${d} minutes on ${url}"`;
        } else if (action === 'stop') {
          command = `pkill -f visit.py && echo "All processes stopped" || echo "No process found"`;
        } else {
          throw new Error("Unknown action");
        }

        const output = await executeOnServer(server, command, timeout);
        const isSuccess = action === 'setup' ? output.includes('SETUP_COMPLETE') : true;
        results.push({
          host: server.host,
          status: isSuccess ? 'success' : 'error',
          output: action === 'setup'
            ? (isSuccess ? 'Server setup completed successfully!' : 'Setup may have issues, check logs.')
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
