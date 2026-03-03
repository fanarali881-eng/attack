import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { host, port, username, password } = await req.json();
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;
    
    // Try to make a request through the proxy
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    
    try {
      const res = await fetch('http://httpbin.org/ip', {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(timeout);
      
      // We can't use proxy directly from serverless, so test via curl on a server
      // Instead, just do a simple HTTP test to the proxy
    } catch(e) {
      clearTimeout(timeout);
    }

    // Test proxy by connecting to it directly
    const testUrl = `http://${host}:${port}`;
    const proxyAuth = Buffer.from(`${username}:${password}`).toString('base64');
    
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 8000);
    
    try {
      const res = await fetch(`http://${host}:${port}`, {
        method: 'CONNECT',
        signal: controller2.signal,
        headers: {
          'Proxy-Authorization': `Basic ${proxyAuth}`,
          'Host': 'httpbin.org:443'
        }
      });
      clearTimeout(timeout2);
      // If we get 407 = auth failed, 402 = payment required, 200 = ok
      if (res.status === 402 || res.status === 407) {
        return NextResponse.json({ status: 'expired', message: 'يجب إضافة رصيد للبروكسي' });
      }
      return NextResponse.json({ status: 'active', message: 'البروكسي شغال' });
    } catch(e) {
      clearTimeout(timeout2);
      // Connection refused or timeout could mean proxy is down or needs payment
      if (e.name === 'AbortError') {
        return NextResponse.json({ status: 'timeout', message: 'البروكسي لا يستجيب' });
      }
      // Try alternative: make a direct HTTP request to proxy as HTTP proxy
      let altTimeout;
      try {
        const controller3 = new AbortController();
        altTimeout = setTimeout(() => controller3.abort(), 8000);
        const res2 = await fetch(`http://${host}:${port}/`, {
          signal: controller3.signal,
          headers: {
            'Proxy-Authorization': `Basic ${proxyAuth}`,
          }
        });
        clearTimeout(altTimeout);
        if (res2.status === 402) {
          return NextResponse.json({ status: 'expired', message: 'يجب إضافة رصيد للبروكسي' });
        }
        if (res2.status === 407) {
          return NextResponse.json({ status: 'auth_failed', message: 'بيانات البروكسي غير صحيحة' });
        }
        return NextResponse.json({ status: 'active', message: 'البروكسي شغال' });
      } catch(e2) {
        if (altTimeout) clearTimeout(altTimeout);
        return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالبروكسي' });
      }
    }
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
