import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, MessageSquare, Send, X } from 'lucide-react';
import {
  useGetSupportMessages,
  useSendSupportMessage,
  getGetSupportMessagesQueryKey,
} from '@workspace/api-client-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL?.trim() || 'https://northstate-blockchain-api.onrender.com').replace(/\/$/, '');
type ChatMessage = { id: string | number; senderRole: 'user' | 'admin' | 'support'; content: string; createdAt: string };

export function HeaderSupportDropdown() {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [input, setInput] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestId, setGuestId] = useState(() => {
    try { return localStorage.getItem('nsl-guest-support-id') || ''; } catch { return ''; }
  });
  const [guestMessages, setGuestMessages] = useState<ChatMessage[]>([]);
  const [guestError, setGuestError] = useState('');
  const [sending, setSending] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useGetSupportMessages({
    query: { queryKey: getGetSupportMessagesQueryKey(), enabled: isLoaded && !!isSignedIn, refetchInterval: isSupportOpen ? 5000 : false },
  });
  const sendSupportMessage = useSendSupportMessage();
  const messages: ChatMessage[] = isSignedIn
    ? ((data?.messages ?? []) as ChatMessage[])
    : guestMessages;

  useEffect(() => {
    if (!isSupportOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsSupportOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSupportOpen]);

  useEffect(() => {
    if (!isSupportOpen || isSignedIn || !guestId) return;
    let active = true;
    const loadMessages = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/support/guest/${encodeURIComponent(guestId)}`);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load your support conversation.');
        if (active) {
          setGuestMessages(Array.isArray(result.messages) ? result.messages : []);
          setGuestError('');
        }
      } catch (error) {
        if (active) setGuestError(error instanceof Error ? error.message : 'Could not load your support conversation.');
      }
    };
    void loadMessages();
    const timer = window.setInterval(() => { void loadMessages(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [isSupportOpen, isSignedIn, guestId]);

  useEffect(() => {
    if (isSupportOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSupportOpen]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending || !isLoaded) return;
    if (!isSignedIn && !guestId && !guestName.trim()) {
      setGuestError('Please enter your name before sending your first message.');
      return;
    }
    setSending(true);
    setGuestError('');
    try {
      if (isSignedIn) {
        await sendSupportMessage.mutateAsync({ data: { content: text } });
        await queryClient.invalidateQueries({ queryKey: getGetSupportMessagesQueryKey() });
      } else if (!guestId) {
        const response = await fetch(`${API_BASE}/api/support/public-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: guestName.trim(), content: text }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.guestId) throw new Error(result.error || 'Your message could not be sent.');
        setGuestId(result.guestId);
        try { localStorage.setItem('nsl-guest-support-id', result.guestId); } catch { /* Conversation remains available for this session. */ }
        const threadResponse = await fetch(`${API_BASE}/api/support/guest/${encodeURIComponent(result.guestId)}`);
        const threadData = await threadResponse.json().catch(() => ({}));
        if (threadResponse.ok && Array.isArray(threadData.messages)) setGuestMessages(threadData.messages);
      } else {
        const response = await fetch(`${API_BASE}/api/support/guest/${encodeURIComponent(guestId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Your message could not be sent.');
        const threadResponse = await fetch(`${API_BASE}/api/support/guest/${encodeURIComponent(guestId)}`);
        const threadData = await threadResponse.json().catch(() => ({}));
        if (threadResponse.ok && Array.isArray(threadData.messages)) setGuestMessages(threadData.messages);
      }
      setInput('');
    } catch (error) {
      setGuestError(error instanceof Error ? error.message : 'Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsSupportOpen(previous => !previous)}
        className="rounded-lg p-2 text-amber-400 transition-colors hover:bg-slate-800 hover:text-amber-300"
        title="Customer Support"
        aria-label="Customer Support"
        data-testid="button-header-support"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {isSupportOpen && (
        <div
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[100] flex max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top))] w-auto flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl animate-rise sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-[75vh] sm:w-96"
          data-testid="panel-header-support"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 p-4 backdrop-blur">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <MessageSquare className="h-4 w-4 text-amber-400" /> Support Chat
            </h3>
            <button type="button" onClick={() => setIsSupportOpen(false)} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Close Support">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            {!isLoaded || (isSignedIn && isLoading) ? (
              <p className="text-center text-xs text-slate-400">Loading conversation…</p>
            ) : messages.length === 0 ? (
              <div className="py-5 text-center">
                <p className="text-sm font-semibold text-white">How can we help?</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Send a message to contact our support team. An admin will reply here.</p>
              </div>
            ) : messages.map(message => {
              const fromUser = message.senderRole === 'user';
              return (
                <div key={message.id} className={`flex ${fromUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${fromUser ? 'rounded-br-sm bg-amber-400 font-medium text-slate-950' : 'rounded-bl-sm border border-slate-700/60 bg-slate-800 text-slate-100'}`}>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p className={`mt-1 text-[10px] ${fromUser ? 'text-slate-900/70' : 'text-slate-400'}`}>{formatTime(message.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-slate-800 bg-slate-900/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            {!isSignedIn && !guestId && (
              <input
                value={guestName}
                onChange={event => setGuestName(event.target.value)}
                placeholder="Your name"
                maxLength={100}
                aria-label="Your name"
                className="w-24 shrink-0 rounded-xl border border-slate-700 bg-slate-800/90 px-2 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-400"
              />
            )}
            <input
              type="text"
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="Type your message…"
              maxLength={5000}
              aria-label="Support message"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-amber-400"
              data-testid="input-header-support"
            />
            <button type="submit" disabled={!input.trim() || sending || !isLoaded} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400 font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40" aria-label="Send">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
          {guestError && <p role="alert" className="shrink-0 border-t border-slate-800 px-3 py-2 text-xs text-rose-300">{guestError}</p>}
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
    <header className="relative flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 p-4">
      <div className="font-bold text-white">{title}</div>
      <div className="flex items-center space-x-3">
        <button type="button" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>
        <HeaderSupportDropdown />
        {children}
      </div>
    </header>
  );
}

export default HeaderNavigation;
