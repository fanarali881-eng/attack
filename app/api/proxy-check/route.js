import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { host, port, username, password } = await req.json();
    
    // Test proxy by making a direct HTTP request to the proxy server
    // Webshare proxies respond to direct HTTP requests
    const proxyAuth = Buffer.from(`${username}-1:${password}`).toString('base64');
    
    // Method 1: Try HTTP CONNECT-style request to proxy
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    try {
      // Make a request to the proxy as if it's a regular HTTP server
      const res = await fetch(`http://${host}:${port}/`, {
        signal: controller.signal,
        headers: {
          'Proxy-Authorization': `Basic ${proxyAuth}`,
          'User-Agent': 'Mozilla/5.0'
        }
      });
      clearTimeout(timeout);
      
      const status = res.status;
      
      // 402 = Payment Required (no bandwidth)
      if (status === 402) {
        return NextResponse.json({ status: 'expired', message: 'يجب إضافة رصيد للبروكسي' });
      }
      // 407 = Auth failed
      if (status === 407) {
        return NextResponse.json({ status: 'auth_failed', message: 'بيانات البروكسي غير صحيحة' });
      }
      // Any other response means proxy is alive
      return NextResponse.json({ status: 'active', message: 'البروكسي شغال ✅' });
      
    } catch(e) {
      clearTimeout(timeout);
      
      if (e.name === 'AbortError') {
        return NextResponse.json({ status: 'timeout', message: 'البروكسي لا يستجيب (timeout)' });
      }
      
      // Method 2: Try connecting to the proxy host directly (TCP check)
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      
      try {
        const res2 = await fetch(`http://${host}:${port}`, {
          method: 'GET',
          signal: controller2.signal,
        });
        clearTimeout(timeout2);
        
        if (res2.status === 402) {
          return NextResponse.json({ status: 'expired', message: 'يجب إضافة رصيد للبروكسي' });
        }
        return NextResponse.json({ status: 'active', message: 'البروكسي شغال ✅' });
      } catch(e2) {
        clearTimeout(timeout2);
        return NextResponse.json({ status: 'error', message: 'تعذر الاتصال بالبروكسي' });
      }
    }
  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
