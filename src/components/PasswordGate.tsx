'use client';

import { useEffect, useState } from 'react';

const PASSWORD = 'sy521';
const STORAGE_KEY = 'cktv_auth';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem('_pw');
    if (saved === PASSWORD) {
      setAuthed(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      localStorage.setItem(STORAGE_KEY, input);
      setAuthed(true);
    } else {
      setError('密码错误');
      setInput('');
    }
  };

  if (!authed) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: '#0f0f0f' }}>
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6 p-8">
          <h1 className="text-2xl font-bold text-white">SYTV</h1>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder="请输入访问密码"
            className="px-4 py-2.5 rounded-lg text-center text-sm outline-none"
            style={{ background: '#1f1f1f', color: '#e8e8e8', border: '1px solid #333', width: 220 }}
            autoFocus
          />
          {error && <p className="text-red-400 text-sm -mt-3">{error}</p>}
          <button
            type="submit"
            className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
          >
            进入
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
