import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

const TEST_SERVER = { host: '46.101.52.177', username: 'root' };

function validateApiKey(req) {
  const authHeader = req.headers.get('x-api-key') || '';
  const validKey = process.env.PANEL_API_KEY;
  if (!validKey || authHeader !== validKey) return false;
  return true;
}

async function runSSHCommand(server, command, timeout = 30000) {
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
        stream.stderr.on('data', (data) => { /* ignore */ });
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
  if (!validateApiKey(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { host, port, username, password } = await req.json();

    if (!host || !port || !username || !password) {
      return NextResponse.json({ status: 'error', message: 'بيانات ناقصة' });
    }

    // The password from the UI is the BASE password (e.g. j7HGTQiRnys66RIM)
    // visit.py automatically appends _country-SaudiArabia_session-xxx
    // For proxy check, we test with _country-SaudiArabia appended
    const testPassword = password.includes('_country-') ? password : `${password}_country-SaudiArabia`;

    // Use base64 encoding to safely pass credentials through shell
    const credsB64 = Buffer.from(JSON.stringify({
      user: username,
      pass: testPassword,
      host: host,
      port: String(port)
    })).toString('base64');

    const cmd = `python3 -c "
import requests, sys, json, base64
creds = json.loads(base64.b64decode('${credsB64}').decode())
try:
    proxy_url = 'http://' + creds['user'] + ':' + creds['pass'] + '@' + creds['host'] + ':' + creds['port']
    proxies = {'http': proxy_url, 'https': proxy_url}
    r = requests.get('https://ipv4.icanhazip.com', proxies=proxies, timeout=20)
    ip = r.text.strip()
    if ip:
        try:
            geo = requests.get('http://ip-api.com/json/' + ip, timeout=10).json()
            print(json.dumps({'ok': True, 'ip': ip, 'country': geo.get('country','?'), 'cc': geo.get('countryCode','')}))
        except:
            print(json.dumps({'ok': True, 'ip': ip, 'country': '?', 'cc': ''}))
    else:
        print(json.dumps({'ok': False, 'error': 'empty_ip'}))
except requests.exceptions.ProxyError as e:
    err = str(e)
    if '407' in err: print(json.dumps({'ok': False, 'error': 'auth_failed'}))
    elif '402' in err: print(json.dumps({'ok': False, 'error': 'no_balance'}))
    else: print(json.dumps({'ok': False, 'error': 'proxy_error'}))
except Exception as e:
    print(json.dumps({'ok': False, 'error': str(e)[:200]}))
"`;

    const result = await runSSHCommand(TEST_SERVER, cmd, 30000);

    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالسيرفر: ' + result.output.substring(0, 100) });
    }

    // Parse JSON from output
    const lines = result.output.split('\n');
    let jsonData = null;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim());
        if (typeof parsed.ok !== 'undefined') { jsonData = parsed; break; }
      } catch(e) {}
    }

    if (!jsonData) {
      return NextResponse.json({ status: 'error', message: 'فشل الفحص: ' + result.output.substring(0, 200) });
    }

    if (jsonData.ok) {
      const isSaudi = jsonData.cc === 'SA';
      return NextResponse.json({ 
        status: 'active', 
        message: `✅ البروكسي شغال | IP: ${jsonData.ip} | ${jsonData.country}${isSaudi ? ' 🇸🇦' : ' ⚠️'}`,
        ip: jsonData.ip,
        country: jsonData.country,
        isSaudi
      });
    } else {
      const errorMap = {
        'auth_failed': '❌ خطأ بالمصادقة - تأكد من كلمة المرور',
        'no_balance': '⚠️ الرصيد خلص - يجب إضافة رصيد',
        'proxy_error': '❌ فشل الاتصال بالبروكسي',
        'empty_ip': '❌ البروكسي ما رجع IP'
      };
      const msg = errorMap[jsonData.error] || `❌ خطأ: ${jsonData.error}`;
      const status = jsonData.error === 'no_balance' ? 'expired' : 'error';
      return NextResponse.json({ status, message: msg });
    }

  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'خطأ: ' + error.message }, { status: 500 });
  }
}
