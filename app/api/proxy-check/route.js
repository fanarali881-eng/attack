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

    // Test PacketStream proxy: get IP and check if it works
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;
    const cmd = `curl -s -x "${proxyUrl}" --connect-timeout 15 https://ipapi.co/json/ 2>&1`;

    const result = await runSSHCommand(TEST_SERVER, cmd, 20000);

    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالسيرفر للفحص' });
    }

    const output = result.output.trim();

    // Try to parse JSON response from ipapi.co
    try {
      const ipInfo = JSON.parse(output);
      if (ipInfo.ip && ipInfo.country_code) {
        const isSaudi = ipInfo.country_code === 'SA';
        return NextResponse.json({ 
          status: 'active', 
          message: `البروكسي شغال ✅ | IP: ${ipInfo.ip} | الدولة: ${ipInfo.country_name || ipInfo.country_code}${isSaudi ? ' 🇸🇦' : ' ⚠️ ليس سعودي!'}` 
        });
      }
      // If we got JSON but no IP, might be an error
      if (ipInfo.error) {
        return NextResponse.json({ status: 'error', message: `خطأ: ${ipInfo.reason || ipInfo.error}` });
      }
    } catch(e) {
      // Not JSON - check for common errors
    }

    // Check for auth errors or empty response
    if (output === '' || output.includes('000') || output.includes('Connection refused')) {
      return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالبروكسي - تأكد من البيانات' });
    }

    if (output.includes('407') || output.includes('Auth') || output.includes('auth')) {
      return NextResponse.json({ status: 'error', message: 'خطأ بالمصادقة - تأكد من اسم المستخدم وكلمة المرور' });
    }

    if (output.includes('402') || output.includes('Payment') || output.includes('bandwidth')) {
      return NextResponse.json({ status: 'expired', message: '⚠️ الرصيد خلص - يجب إضافة رصيد' });
    }

    // If we got some HTML response, proxy might be working
    if (output.includes('<!') || output.includes('<html')) {
      return NextResponse.json({ status: 'active', message: 'البروكسي شغال ✅ (تعذر تحديد الدولة)' });
    }

    return NextResponse.json({ status: 'error', message: `رد غير متوقع: ${output.substring(0, 100)}` });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
