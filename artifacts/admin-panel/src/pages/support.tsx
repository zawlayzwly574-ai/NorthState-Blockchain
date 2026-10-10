import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Check, MessageSquare, Pencil, Send, Trash2, User2, X } from 'lucide-react';
import {
  useAdminSupportThreads,
  useAdminSupportThread,
  useAdminSupportReply,
  useUpdateAdminSupportMessage,
  useDeleteAdminSupportMessage,
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
  const [replyError, setReplyError] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [messageActionError, setMessageActionError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: threads = [], isLoading } = useAdminSupportThreads();
  const { data: thread } = useAdminSupportThread(selectedUserId ?? '');
  const replyMut = useAdminSupportReply();
  const updateMessageMut = useUpdateAdminSupportMessage();
  const deleteMessageMut = useDeleteAdminSupportMessage();

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages.length]);

  const handleSelectThread = (userId: string) => {
    setSelectedUserId(userId);
    setReplyInput('');
    setReplyError('');
    setMessageActionError('');
    setEditingMessageId(null);
    setEditingContent('');
  };

  const handleSend = async () => {
    if (!selectedUserId || !replyInput.trim() || sending) return;
    setSending(true);
    setReplyError('');
    try {
      await replyMut.mutateAsync({ userId: selectedUserId, content: replyInput.trim() });
      setReplyInput('');
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : 'Could not send the reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleStartEdit = (messageId: number, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
    setMessageActionError('');
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingContent('');
    setMessageActionError('');
  };

  const handleSaveEdit = async (messageId: number) => {
    if (!selectedUserId || !editingContent.trim() || updateMessageMut.isPending) return;
    setMessageActionError('');
    try {
      await updateMessageMut.mutateAsync({
        userId: selectedUserId,
        messageId,
        content: editingContent.trim(),
      });
      setEditingMessageId(null);
      setEditingContent('');
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Could not save the message. Please try again.');
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (!selectedUserId || deleteMessageMut.isPending) return;
    if (!window.confirm('Delete this message permanently? This cannot be undone.')) return;
    setMessageActionError('');
    try {
      await deleteMessageMut.mutateAsync({ userId: selectedUserId, messageId });
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setEditingContent('');
      }
    } catch (error) {
      setMessageActionError(error instanceof Error ? error.message : 'Could not delete the message. Please try again.');
    }
  };

  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div className="admin-support-page flex h-[calc(100dvh-64px)] min-h-0 w-full min-w-0 flex-col overflow-hidden">
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

      <div className="admin-support-layout flex min-h-0 min-w-0 flex-1 gap-4">
        {/* ── Thread list ── */}
        <div className={`admin-support-thread-list w-full md:w-72 xl:w-80 shrink-0 flex-col rounded-xl border border-border bg-card overflow-hidden ${selectedUserId ? 'admin-support-thread-list--hidden hidden md:flex' : 'flex'}`}>
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
                  onClick={() => handleSelectThread(t.userId)}
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
        <div className={`admin-support-thread-detail min-w-0 flex-1 flex-col rounded-xl border border-border bg-card overflow-hidden ${selectedUserId ? 'admin-support-thread-detail--active flex' : 'hidden md:flex'}`}>
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
              <div className="shrink-0 border-b border-border bg-card/50 px-3 py-3 sm:px-5 sm:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setSelectedUserId(null); setReplyInput(''); setEditingMessageId(null); setMessageActionError(''); }}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-secondary/50 text-muted-foreground transition hover:text-foreground md:hidden"
                    aria-label="Back to support threads"
                    data-testid="button-support-back-to-threads"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary font-bold text-sm">
                    {thread?.displayName?.charAt(0)?.toUpperCase() ?? <User2 size={17} />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{thread?.displayName ?? '…'}</p>
                    <p className="truncate text-xs text-muted-foreground">{thread?.email ?? ''}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
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
                    <div key={msg.id} className={`flex min-w-0 ${msg.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      {msg.senderRole === 'user' && (
                        <div className="mr-2 mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground">
                          {thread.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={`min-w-0 max-w-[92%] rounded-2xl px-3.5 py-3 sm:max-w-[82%] sm:px-4 ${
                        msg.senderRole === 'admin'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm bg-secondary/60 text-foreground'
                      }`}>
                        {msg.senderRole === 'admin' && (
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-60">Support</p>
                        )}
                        {editingMessageId === msg.id ? (
                          <div className="w-full min-w-0 space-y-2">
                            <textarea
                              value={editingContent}
                              onChange={e => setEditingContent(e.target.value)}
                              rows={4}
                              maxLength={4000}
                              autoFocus
                              aria-label="Edit support message"
                              data-testid={`input-edit-support-message-${msg.id}`}
                              className="w-full min-h-24 max-h-[40dvh] resize-y rounded-xl border border-border/60 bg-black/10 px-3 py-2.5 text-base leading-6 text-current outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/30 sm:text-sm"
                            />
                            <div className="flex flex-wrap justify-end gap-2">
                              <button type="button" onClick={handleCancelEdit} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-current/20 px-3 text-xs font-semibold">
                                <X size={14} /> Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(msg.id)}
                                disabled={!editingContent.trim() || editingContent.trim() === msg.content || updateMessageMut.isPending}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-black/15 px-3 text-xs font-bold disabled:opacity-40"
                                data-testid={`button-save-support-message-${msg.id}`}
                              >
                                <Check size={14} /> {updateMessageMut.isPending ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="break-words text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.content}</p>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className={`text-[10px] ${msg.senderRole === 'admin' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {msg.senderRole === 'admin' && (
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(msg.id, msg.content)}
                                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold opacity-90 transition hover:bg-black/10 hover:opacity-100"
                                    aria-label={`Edit support reply ${msg.id}`}
                                    data-testid={`button-edit-support-message-${msg.id}`}
                                  >
                                    <Pencil size={14} /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg.id)}
                                    disabled={deleteMessageMut.isPending}
                                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold opacity-90 transition hover:bg-red-500/15 hover:text-red-500 hover:opacity-100 disabled:opacity-40"
                                    aria-label={`Delete support reply ${msg.id}`}
                                    data-testid={`button-delete-support-message-${msg.id}`}
                                  >
                                    <Trash2 size={14} /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="admin-support-composer shrink-0 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
                {(replyError || messageActionError) && (
                  <div role="alert" className="mb-2 break-words rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {replyError || messageActionError}
                  </div>
                )}
                <form
                  onSubmit={e => { e.preventDefault(); void handleSend(); }}
                  className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-end"
                >
                  <textarea
                    value={replyInput}
                    onChange={e => { setReplyInput(e.target.value); if (replyError) setReplyError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void handleSend(); } }}
                    placeholder="Write your reply… (Enter to send, Shift+Enter for a new line)"
                    rows={3}
                    maxLength={4000}
                    className="min-h-[104px] max-h-[35dvh] w-full min-w-0 flex-1 resize-y rounded-xl border border-input bg-secondary/40 px-3 py-3 text-base leading-6 outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/20 sm:min-h-[52px] sm:max-h-[140px] sm:resize-y sm:py-2.5 sm:text-sm"
                    data-testid="input-admin-reply"
                  />
                  <button
                    type="submit"
                    disabled={!replyInput.trim() || sending}
                    className="flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition disabled:opacity-40 hover:bg-primary/90 active:scale-[.99] sm:w-12 sm:px-0"
                    aria-label="Send reply"
                    data-testid="button-admin-reply-send"
                  >
                    <Send size={16} />
                    <span className="sm:hidden">{sending ? 'Sending…' : 'Send reply'}</span>
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
