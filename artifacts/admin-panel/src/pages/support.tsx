import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, User2 } from 'lucide-react';
import {
  useAdminSupportThreads,
  useAdminSupportThread,
  useAdminSupportReply,
  type SupportThreadItem,
} from '@/lib/api';

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Support() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads = [], isLoading } = useAdminSupportThreads();
  const { data: thread } = useAdminSupportThread(selectedUserId ?? '');
  const replyMut = useAdminSupportReply();

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages.length]);

  const handleSend = async () => {
    if (!selectedUserId || !replyInput.trim() || sending) return;
    setSending(true);
    try {
      await replyMut.mutateAsync({ userId: selectedUserId, content: replyInput.trim() });
      setReplyInput('');
    } finally {
      setSending(false);
    }
  };

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Page header */}
      <div className="shrink-0 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Customer Support</h1>
          {totalUnread > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white">
              {totalUnread} new
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Manage and respond to user support threads in real time</p>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* ── Thread list ── */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold">Threads</span>
            <span className="text-xs font-mono text-muted-foreground">{threads.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <span className="text-xs text-muted-foreground">Loading…</span>
              </div>
            ) : threads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No threads yet</p>
                <p className="text-xs text-muted-foreground/60">User messages will appear here</p>
              </div>
            ) : (
              threads.map((t: SupportThreadItem) => (
                <button
                  key={t.threadId}
                  onClick={() => { setSelectedUserId(t.userId); setReplyInput(''); }}
                  className={`w-full text-left px-4 py-3.5 border-b border-border/40 transition hover:bg-white/5 ${
                    selectedUserId === t.userId
                      ? 'bg-primary/8 border-l-2 border-l-primary'
                      : 'border-l-2 border-l-transparent'
                  }`}
                  data-testid={`thread-${t.userId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{t.displayName || 'Unknown'}</span>
                        {t.unreadCount > 0 && (
                          <span className="shrink-0 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px]">
                            {t.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">{t.email}</p>
                      {t.lastMessage && (
                        <p className="mt-1.5 text-xs text-muted-foreground/60 truncate">{t.lastMessage}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatRelative(t.lastMessageAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Thread detail ── */}
        <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden min-w-0">
          {!selectedUserId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-6">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/8 text-primary/40">
                <MessageSquare size={26} />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Select a thread to view the conversation</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="shrink-0 px-5 py-4 border-b border-border bg-card/50 flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary font-bold text-sm">
                  {thread?.displayName?.charAt(0)?.toUpperCase() ?? <User2 size={17} />}
                </div>
                <div>
                  <p className="text-sm font-bold">{thread?.displayName ?? '…'}</p>
                  <p className="text-xs text-muted-foreground">{thread?.email ?? ''}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {!thread ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs text-muted-foreground">Loading messages…</span>
                  </div>
                ) : thread.messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-xs text-muted-foreground">No messages yet</span>
                  </div>
                ) : (
                  thread.messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      {msg.senderRole === 'user' && (
                        <div className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground">
                          {thread.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={`max-w-[68%] rounded-2xl px-3.5 py-2.5 ${
                        msg.senderRole === 'admin'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm bg-secondary/60 text-foreground'
                      }`}>
                        {msg.senderRole === 'admin' && (
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-60">Support</p>
                        )}
                        <p className="text-sm leading-5 whitespace-pre-wrap">{msg.content}</p>
                        <p className={`mt-1 text-[10px] ${msg.senderRole === 'admin' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="shrink-0 border-t border-border p-4">
                <form
                  onSubmit={e => { e.preventDefault(); handleSend(); }}
                  className="flex items-end gap-2"
                >
                  <textarea
                    value={replyInput}
                    onChange={e => setReplyInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Reply as Northstar Support…"
                    rows={2}
                    className="min-h-[52px] max-h-[140px] flex-1 resize-none rounded-xl border border-input bg-secondary/40 px-3 py-2.5 text-sm leading-5 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20"
                    data-testid="input-admin-reply"
                  />
                  <button
                    type="submit"
                    disabled={!replyInput.trim() || sending}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition disabled:opacity-40 hover:bg-primary/90 active:scale-95"
                    aria-label="Send reply"
                    data-testid="button-admin-reply-send"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
