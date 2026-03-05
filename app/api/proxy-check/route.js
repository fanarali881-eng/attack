import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const TEST_SERVER = { host: '46.101.52.177', username: 'root' };

async function runSSHCommand(server, command, timeout = 10000) {
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
      done({ status: 'error', output: output.trim() || 'Timeout' });
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, { pty: false }, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          return done({ status: 'error', output: err.message });
        }
        stream.on('data', (data) => { output += data.toString(); });
        stream.stderr.on('data', (data) => { /* ignore stderr */ });
        stream.on('close', () => {
          clearTimeout(timer);
          done({ status: 'success', output: output.trim() });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      done({ status: 'error', output: err.message });
    });

    conn.connect({
      host: server.host,
      port: 22,
      username: server.username,
      password: process.env.VPS_PASSWORD,
      readyTimeout: 8000,
      keepaliveInterval: 5000,
    });
  });
}

export async function POST(req) {
  try {
    const { host, port, username, password } = await req.json();

    // Test proxy: first get IP, then check country
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;
    const cmd = `IP=$(curl -s -x "${proxyUrl}" --connect-timeout 15 https://ipv4.icanhazip.com 2>/dev/null); echo "IP:$IP"; if [ -n "$IP" ]; then curl -s "http://ip-api.com/json/$IP" --connect-timeout 10 2>/dev/null; fi`;

    const result = await runSSHCommand(TEST_SERVER, cmd, 25000);

    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالسيرفر للفحص' });
    }

    const output = result.output.trim();
    const lines = output.split('\n');
    const ipLine = lines[0] || '';
    const ip = ipLine.replace('IP:', '').trim();

    if (!ip) {
      // No IP returned - proxy failed
      if (output.includes('407') || output.includes('Auth')) {
        return NextResponse.json({ status: 'error', message: 'خطأ بالمصادقة - تأكد من اسم المستخدم وكلمة المرور' });
      }
      if (output.includes('402') || output.includes('Payment') || output.includes('bandwidth')) {
        return NextResponse.json({ status: 'expired', message: '⚠️ الرصيد خلص - يجب إضافة رصيد' });
      }
      return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالبروكسي - تأكد من البيانات' });
    }

    // Got IP - try to parse country info
    const jsonStr = lines.slice(1).join('\n');
    try {
      const info = JSON.parse(jsonStr);
      if (info.status === 'success') {
        const isSaudi = info.countryCode === 'SA';
        return NextResponse.json({ 
          status: 'active', 
          message: `البروكسي شغال ✅ | IP: ${ip} | ${info.country}${isSaudi ? ' 🇸🇦' : ' ⚠️'}` 
        });
      }
    } catch(e) {
      // Could not get country info but proxy works
    }

    return NextResponse.json({ status: 'active', message: `البروكسي شغال ✅ | IP: ${ip}` });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
