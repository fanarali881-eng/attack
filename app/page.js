'use client';
import { useState } from 'react';
import { Play, Square, Upload, Terminal, Settings, Loader2 } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState('');

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const handleAction = async (action) => {
    if (action === 'start' && !url) return addLog("❌ خطأ: الرجاء إدخال الرابط أولاً");

    setLoading(true);
    setActiveAction(action);

    const actionNames = {
      setup: 'تجهيز السيرفرات',
      deploy: 'رفع السكريبت',
      start: 'بدء الهجوم',
      stop: 'إيقاف الكل'
    };

    addLog(`🚀 جاري ${actionNames[action]}...`);

    if (action === 'setup') {
      addLog("⏳ تجهيز السيرفرات قد يستغرق عدة دقائق، الرجاء الانتظار...");
    }

    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url })
      });
      const data = await res.json();

      if (data.error) {
        addLog(`❌ خطأ: ${data.error}`);
      } else {
        data.results.forEach(r => {
          if (r.status === 'success') {
            addLog(`✅ ${r.host}: ${r.output || 'تم بنجاح'}`);
          } else {
            addLog(`❌ ${r.host}: ${r.error}`);
          }
        });
      }
    } catch (err) {
      addLog(`❌ خطأ في النظام: ${err.message}`);
    }
    setLoading(false);
    setActiveAction('');
  };

  return (
    <div className="min-h-screen bg-black text-green-500 p-4 md:p-8 font-mono">
      <div className="max-w-3xl mx-auto border border-green-800 p-6 rounded bg-gray-900">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-center border-b border-green-800 pb-4">
          ⚔️ لوحة تحكم الهجوم (Attack Panel)
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block mb-2 text-sm">الرابط المستهدف (Target URL)</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-black border border-green-700 p-3 rounded text-white focus:outline-none focus:border-green-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <button
              onClick={() => handleAction('setup')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-purple-900 hover:bg-purple-800 text-white p-4 rounded transition disabled:opacity-50 text-sm"
            >
              {activeAction === 'setup' ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />}
              0. تجهيز السيرفرات
            </button>

            <button
              onClick={() => handleAction('deploy')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 text-white p-4 rounded transition disabled:opacity-50 text-sm"
            >
              {activeAction === 'deploy' ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              1. رفع السكريبت
            </button>

            <button
              onClick={() => handleAction('start')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-red-900 hover:bg-red-800 text-white p-4 rounded transition disabled:opacity-50 text-sm"
            >
              {activeAction === 'start' ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              2. بدء الهجوم
            </button>

            <button
              onClick={() => handleAction('stop')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white p-4 rounded transition disabled:opacity-50 text-sm"
            >
              {activeAction === 'stop' ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />}
              إيقاف الكل
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Terminal size={16} /> سجل النظام (System Logs)
            </div>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-gray-500 hover:text-gray-300 transition"
            >
              مسح السجل
            </button>
          </div>
          <div className="bg-black border border-green-900 h-72 overflow-y-auto p-4 rounded text-xs font-mono">
            {logs.length === 0 ? (
              <span className="text-gray-600">بانتظار الأوامر...</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1 border-b border-gray-900 pb-1">{log}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
