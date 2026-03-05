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
        stream.stderr.on('data', (data) => { output += data.toString(); });
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

    // Actually test the proxy by SSHing into a server and doing a real CONNECT test
    const testUser = username || 'fanar';
    const cmd = `curl -s -x http://${testUser}:${password}@${host}:${port} -o /dev/null -w '%{http_code}' --connect-timeout 10 https://example.com/ 2>&1; echo "|||"; curl -s -v -x http://${testUser}:${password}@${host}:${port} https://example.com/ 2>&1 | grep -i 'Webshare-Reason\\|402\\|Payment\\|PacketStream' | head -3`;

    const result = await runSSHCommand(TEST_SERVER, cmd, 15000);

    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالسيرفر للفحص' });
    }

    const parts = result.output.split('|||');
    const httpCode = (parts[0] || '').trim();
    const details = (parts[1] || '').trim();

    if (httpCode === '200' || httpCode === '301' || httpCode === '302') {
      return NextResponse.json({ status: 'active', message: 'البروكسي شغال ✅ والرصيد متاح' });
    }

    if (httpCode === '000' || details.includes('bandwidthlimit') || details.includes('402') || details.includes('Payment')) {
      return NextResponse.json({ status: 'expired', message: '⚠️ الرصيد خلص (bandwidth limit) - يجب إضافة رصيد' });
    }

    if (httpCode === '407') {
      return NextResponse.json({ status: 'error', message: 'خطأ بالمصادقة - تأكد من اسم المستخدم وكلمة المرور' });
    }

    return NextResponse.json({ status: 'error', message: `رد غير متوقع: HTTP ${httpCode}` });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
