import React, { useState, useEffect, useRef } from 'react';
import { Bell, MessageSquare, Send, X } from 'lucide-react';

export function HeaderSupportDropdown() {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'support'; text: string; time: string }>>([
    {
      id: 'welcome',
      role: 'support',
      text: 'Welcome to North State Support. How can we help you today?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isSupportOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsSupportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSupportOpen]);

  useEffect(() => {
    if (isSupportOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isSupportOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), role: 'user', text, time: now },
    ]);
    setInput('');

    // Automated support reply
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'support',
          text: 'Thank you for reaching out. A North State support specialist has received your message and will follow up shortly.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 900);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Support Chat Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsSupportOpen((prev) => !prev)}
        className="p-2 text-amber-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition-colors"
        title="Customer Support"
        aria-label="Customer Support"
        data-testid="button-header-support"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Support Dropdown Panel with Fixed Height & Inner Scroll */}
      {isSupportOpen && (
        <div
          className="absolute right-0 mt-2 w-80 md:w-96 max-h-[75vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-rise"
          data-testid="panel-header-support"
        >
          {/* Fixed Header */}
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/90 backdrop-blur shrink-0">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              Support Chat
            </h3>
            <button
              type="button"
              onClick={() => setIsSupportOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close Support"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Body - စာမျက်နှာတစ်ပြင်လုံး မလှုပ်ဘဲ အထဲက Content သာ ရွေ့မည့် အပိုင်း */}
          <div className="p-4 overflow-y-auto flex-1 max-h-[50vh] space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-400 text-slate-950 font-medium rounded-br-sm'
                      : 'bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/60'
                  }`}
                >
                  <p>{msg.text}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      msg.role === 'user' ? 'text-slate-900/70' : 'text-slate-400'
                    }`}
                  >
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Fixed Footer Input Form */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-slate-800 bg-slate-900/95 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message…"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-amber-400 transition"
              data-testid="input-header-support"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400 text-slate-950 font-bold transition hover:bg-amber-300 disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export function HeaderNavigation({
  title = 'North State Blockchain',
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 shrink-0">
      <div className="font-bold text-white">{title}</div>

      <div className="flex items-center space-x-3">
        {/* Notifications Button */}
        <button
          type="button"
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>

        {/* Support Chat Dropdown */}
        <HeaderSupportDropdown />

        {children}
      </div>
    </header>
  );
}

export default HeaderNavigation;
