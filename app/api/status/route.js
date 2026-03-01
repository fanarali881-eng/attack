import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

async function getServerStatus(server, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error('Timeout'));
    }, timeout);

    conn.on('ready', () => {
      clearTimeout(timer);
      conn.exec('cat /root/visit_status.json 2>/dev/null || echo "none"', (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let output = '';
        stream.on('close', () => {
          conn.end();
          resolve(output.trim());
        }).on('data', (data) => {
          output += data;
        }).stderr.on('data', () => {});
      });
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    }).connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 10000,
    });
  });
}

export async function POST(req) {
  try {
    const { servers } = await req.json();
    const results = [];

    for (const server of servers) {
      try {
        const raw = await getServerStatus(server);
        if (raw === 'none' || !raw) {
          results.push({ host: server.host, status: 'idle', visits: 0, target: 0, progress: 0, remaining: 0, errors: 0 });
        } else {
          const data = JSON.parse(raw);
          results.push({ host: server.host, ...data });
        }
      } catch (error) {
        results.push({ host: server.host, status: 'offline', error: error.message });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
