import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

async function getServerStatus(server) {
  return new Promise((resolve) => {
    const conn = new Client();
    let resolved = false;

    const done = (result) => {
      if (!resolved) {
        resolved = true;
        try { conn.end(); } catch(e) {}
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      try { conn.destroy(); } catch(e) {}
      done({ host: server.host, status: 'offline', error: 'Timeout' });
    }, 5000);

    conn.on('ready', () => {
      conn.exec('cat /root/visit_status.json 2>/dev/null || echo "NONE"', (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return done({ host: server.host, status: 'offline', error: err.message });
        }
        let output = '';
        stream.on('data', (data) => {
          output += data.toString();
        });
        stream.stderr.on('data', () => {});
        stream.on('close', () => {
          clearTimeout(timer);
          const raw = output.trim();
          if (raw === 'NONE' || !raw) {
            done({ host: server.host, status: 'idle', visits: 0, target: 0, progress: 0, remaining: 0, errors: 0 });
          } else {
            try {
              const data = JSON.parse(raw);
              done({ host: server.host, ...data });
            } catch(e) {
              done({ host: server.host, status: 'idle', visits: 0, target: 0, progress: 0, remaining: 0, errors: 0 });
            }
          }
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      done({ host: server.host, status: 'offline', error: err.message });
    });

    conn.connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 5000,
      keepaliveInterval: 0,
    });
  });
}

// Validate API key
function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) {
    return false;
  }
  return true;
}

export async function POST(req) {
  // Authentication check
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { servers } = await req.json();
    // Query all servers in parallel for speed
    const results = await Promise.all(
      servers.map(server => getServerStatus(server))
    );
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
