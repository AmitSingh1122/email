import {
  ArrowLeft,
  Forward,
  Inbox,
  Mail,
  Maximize2,
  Minimize2,
  MoreVertical,
  RefreshCw,
  Reply,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DomainConfig, EmailMessage, MailboxAccount, MailFolder } from '../types/mail';

export type MailViewFolder = MailFolder | 'starred';

interface MailboxViewProps {
  config: DomainConfig;
  mailboxes: MailboxAccount[];
  messages: EmailMessage[];
  folder: MailViewFolder;
  searchQuery: string;
  accountFilter: string;
  composeOpen: boolean;
  onCloseCompose: () => void;
  onOpenCompose: () => void;
  onRefresh: () => Promise<void>;
  onSendEmail: (payload: {
    fromLocal: string;
    to: string;
    subject: string;
    body: string;
  }) => Promise<void>;
  onSimulateInbound: (payload: {
    from: string;
    toLocal: string;
    subject: string;
    body: string;
    spfStatus: 'pass' | 'softfail' | 'fail';
    dkimSigned: boolean;
  }) => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
  onDeleteMessage: (id: string) => Promise<void>;
}

function formatGmailDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getSenderDisplay(email: string): string {
  const local = email.split('@')[0] || email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function MailboxView({
  config,
  mailboxes,
  messages,
  folder,
  searchQuery,
  accountFilter,
  composeOpen,
  onCloseCompose,
  onOpenCompose,
  onRefresh,
  onSendEmail,
  onSimulateInbound,
  onMarkRead,
  onDeleteMessage,
}: MailboxViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Record<string, boolean>>({});
  const [showRawHeaders, setShowRawHeaders] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showInboundTest, setShowInboundTest] = useState(false);

  // Compose state
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeExpanded, setComposeExpanded] = useState(false);
  const [fromLocal, setFromLocal] = useState(mailboxes[0]?.localPart || 'admin');
  const [toAddress, setToAddress] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Inbound test modal state
  const [inboundFrom, setInboundFrom] = useState('alerts@partner-relay.org');
  const [inboundToLocal, setInboundToLocal] = useState(mailboxes[0]?.localPart || 'admin');
  const [inboundSubject, setInboundSubject] = useState(
    `Inbound Delivery Check (${config.domain})`
  );
  const [inboundSpf, setInboundSpf] = useState<'pass' | 'softfail' | 'fail'>('pass');
  const [inboundDkim, setInboundDkim] = useState(true);
  const [simulatingInbound, setSimulatingInbound] = useState(false);

  useEffect(() => {
    setSelectedId(null);
    setShowRawHeaders(false);
  }, [folder, accountFilter]);

  useEffect(() => {
    if (mailboxes.length > 0 && !mailboxes.some((m) => m.localPart === fromLocal)) {
      setFromLocal(mailboxes[0].localPart);
    }
  }, [mailboxes, fromLocal]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return messages.filter((m) => {
      if (folder === 'starred') {
        if (!starredIds[m.id]) return false;
      } else if (m.folder !== folder) {
        return false;
      }

      if (accountFilter !== 'all') {
        const targetAddr = `${accountFilter}@${config.domain}`.toLowerCase();
        if (m.from.toLowerCase() !== targetAddr && m.to.toLowerCase() !== targetAddr) {
          return false;
        }
      }

      if (!q) return true;
      return (
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.to.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q)
      );
    });
  }, [messages, folder, starredIds, accountFilter, config.domain, searchQuery]);

  const activeMessage = useMemo(
    () => filteredMessages.find((m) => m.id === selectedId) ?? null,
    [filteredMessages, selectedId]
  );

  const handleOpenMessage = async (msg: EmailMessage) => {
    setSelectedId(msg.id);
    setShowRawHeaders(false);
    if (!msg.read) {
      await onMarkRead(msg.id);
    }
  };

  const handleToggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setStarredIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteRow = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (selectedId === id) setSelectedId(null);
    await onDeleteMessage(id);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleReply = (msg: EmailMessage) => {
    setToAddress(msg.from);
    setSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    setBody(`\n\nOn ${new Date(msg.timestamp).toLocaleString()}, ${msg.from} wrote:\n> ${msg.body.replace(/\n/g, '\n> ')}`);
    setComposeMinimized(false);
    onOpenCompose();
  };

  const handleForward = (msg: EmailMessage) => {
    setToAddress('');
    setSubject(msg.subject.startsWith('Fwd:') ? msg.subject : `Fwd: ${msg.subject}`);
    setBody(
      `\n\n---------- Forwarded message ---------\nFrom: ${msg.from}\nDate: ${new Date(msg.timestamp).toLocaleString()}\nSubject: ${msg.subject}\nTo: ${msg.to}\n\n${msg.body}`
    );
    setComposeMinimized(false);
    onOpenCompose();
  };

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toAddress.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await onSendEmail({
        fromLocal,
        to: toAddress.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      setToAddress('');
      setSubject('');
      setBody('');
      onCloseCompose();
    } finally {
      setSending(false);
    }
  };

  const handleInboundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulatingInbound(true);
    try {
      await onSimulateInbound({
        from: inboundFrom.trim(),
        toLocal: inboundToLocal,
        subject: inboundSubject.trim(),
        body: `Inbound SMTP connection received on ${config.mailHostname}:25 over TLSv1.3.\nEvaluated SPF=${inboundSpf}, DKIM=${inboundDkim ? 'pass' : 'fail'}, DMARC policy=${config.dmarcPolicy}.`,
        spfStatus: inboundSpf,
        dkimSigned: inboundDkim,
      });
      setShowInboundTest(false);
    } finally {
      setSimulatingInbound(false);
    }
  };

  const folderHeading =
    folder === 'inbox'
      ? 'Inbox'
      : folder === 'sent'
        ? 'Sent'
        : folder === 'starred'
          ? 'Starred'
          : 'Spam';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden flex flex-col min-h-[calc(100vh-6.25rem)]">
      {/* Reading View */}
      {activeMessage ? (
        <div className="flex flex-col flex-1">
          <div className="h-12 px-4 sm:px-6 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Back to list"
                className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDeleteMessage(activeMessage.id);
                  setSelectedId(null);
                }}
                aria-label="Delete message"
                className="p-2 text-slate-600 hover:text-red-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => handleToggleStar(e, activeMessage.id)}
                aria-label="Toggle star"
                className="p-2 text-slate-600 hover:text-amber-500 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <Star
                  className={`w-4 h-4 ${
                    starredIds[activeMessage.id] ? 'fill-amber-400 text-amber-500' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="tabular-nums">
                {new Date(activeMessage.timestamp).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="p-6 sm:px-10 sm:py-8 max-w-4xl space-y-6 flex-1">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-500">
                {folderHeading} · {config.domain}
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
                {activeMessage.subject}
              </h2>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                  {getSenderDisplay(activeMessage.from).charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {getSenderDisplay(activeMessage.from)}
                    </span>
                    <span className="text-xs font-mono text-slate-500 truncate">
                      &lt;{activeMessage.from}&gt;
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    to <span className="font-mono text-slate-700">{activeMessage.to}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span
                      className={
                        activeMessage.dkimSigned
                          ? 'text-emerald-700 font-medium'
                          : 'text-amber-700 font-medium'
                      }
                    >
                      {activeMessage.dkimSigned ? 'DKIM Verified' : 'Unsigned'}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span
                      className={
                        activeMessage.spfStatus === 'pass' ? 'text-emerald-700' : 'text-red-700'
                      }
                    >
                      SPF {activeMessage.spfStatus}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500 font-mono">{activeMessage.tlsCipher}</span>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setShowRawHeaders((prev) => !prev)}
                      className="text-blue-600 hover:underline font-medium cursor-pointer"
                    >
                      {showRawHeaders ? 'Hide original' : 'Show original'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {showRawHeaders && (
              <pre className="p-4 text-xs font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                {activeMessage.rawHeaders}
              </pre>
            )}

            <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap">
              {activeMessage.body}
            </div>

            <div className="pt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleReply(activeMessage)}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-full hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Reply className="w-3.5 h-3.5" />
                Reply
              </button>
              <button
                type="button"
                onClick={() => handleForward(activeMessage)}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-full hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <Forward className="w-3.5 h-3.5" />
                Forward
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Gmail Message List View */
        <div className="flex flex-col flex-1">
          <div className="h-12 px-4 sm:px-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                aria-label="Refresh mail"
                className="p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <h2 className="text-sm font-semibold text-slate-800">{folderHeading}</h2>
              <span className="text-xs text-slate-400 tabular-nums">
                ({filteredMessages.length})
              </span>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                aria-label="More mail actions"
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {moreMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      setShowInboundTest((prev) => !prev);
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Simulate Inbound Test Email
                  </button>
                </div>
              )}
            </div>
          </div>

          {showInboundTest && (
            <form
              onSubmit={handleInboundSubmit}
              className="p-5 border-b border-slate-200 bg-slate-50/70 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">
                  Test Inbound SMTP Delivery ({config.mailHostname}:25)
                </span>
                <button
                  type="button"
                  onClick={() => setShowInboundTest(false)}
                  className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="email"
                  required
                  value={inboundFrom}
                  onChange={(e) => setInboundFrom(e.target.value)}
                  placeholder="sender@example.com"
                  className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                />
                <select
                  value={inboundToLocal}
                  onChange={(e) => setInboundToLocal(e.target.value)}
                  className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md"
                >
                  {mailboxes.map((m) => (
                    <option key={m.id} value={m.localPart}>
                      to: {m.localPart}@{config.domain}
                    </option>
                  ))}
                </select>
                <select
                  value={inboundSpf}
                  onChange={(e) => setInboundSpf(e.target.value as 'pass' | 'softfail' | 'fail')}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="pass">SPF Pass</option>
                  <option value="softfail">SPF Softfail</option>
                  <option value="fail">SPF Fail</option>
                </select>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inboundDkim}
                      onChange={(e) => setInboundDkim(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    DKIM
                  </label>
                  <button
                    type="submit"
                    disabled={simulatingInbound}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 cursor-pointer whitespace-nowrap"
                  >
                    {simulatingInbound ? 'Delivering...' : 'Deliver'}
                  </button>
                </div>
              </div>
              <input
                type="text"
                required
                value={inboundSubject}
                onChange={(e) => setInboundSubject(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
              />
            </form>
          )}

          {filteredMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                {folder === 'inbox' ? <Inbox className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
              </div>
              <p className="text-sm font-medium text-slate-800">
                No conversations in {folderHeading}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Messages sent or received on <span className="font-mono">{config.domain}</span> will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
              {filteredMessages.map((msg) => {
                const isUnread = !msg.read && msg.folder === 'inbox';
                const isStarred = Boolean(starredIds[msg.id]);
                const snippet = msg.body.replace(/\s+/g, ' ').trim();
                const displayParty =
                  folder === 'sent'
                    ? `To: ${getSenderDisplay(msg.to)}`
                    : getSenderDisplay(msg.from);

                return (
                  <div
                    key={msg.id}
                    onClick={() => handleOpenMessage(msg)}
                    className={`group flex items-center gap-3 px-4 sm:px-5 h-11 cursor-pointer transition-colors ${
                      isUnread
                        ? 'bg-white text-slate-900 font-semibold hover:bg-slate-50'
                        : 'bg-slate-50/40 text-slate-700 font-normal hover:bg-slate-100/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleToggleStar(e, msg.id)}
                      aria-label={isStarred ? 'Unstar' : 'Star'}
                      className="p-1 text-slate-300 hover:text-amber-500 shrink-0 cursor-pointer"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isStarred ? 'fill-amber-400 text-amber-500' : ''
                        }`}
                      />
                    </button>

                    <div className="w-36 sm:w-48 truncate text-sm shrink-0">
                      {displayParty}
                    </div>

                    <div className="flex-1 min-w-0 truncate text-sm">
                      <span>{msg.subject}</span>
                      <span className="text-slate-400 font-normal"> — {snippet}</span>
                    </div>

                    <div className="hidden md:flex items-center gap-2 shrink-0 text-[11px] font-normal text-slate-400">
                      <span>{msg.dkimSigned ? 'DKIM' : 'No DKIM'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteRow(e, msg.id)}
                      aria-label="Delete"
                      className="hidden group-hover:inline-flex p-1.5 text-slate-400 hover:text-red-600 rounded-full hover:bg-slate-200/60 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-16 text-right text-xs tabular-nums shrink-0 group-hover:hidden sm:group-hover:block">
                      {formatGmailDate(msg.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Floating Gmail-Style Compose Window */}
      {composeOpen && (
        <div
          className={`fixed z-50 bg-white border border-slate-300 rounded-t-xl shadow-2xl flex flex-col transition-all ${
            composeExpanded
              ? 'inset-4 sm:inset-10 rounded-xl'
              : composeMinimized
                ? 'bottom-0 right-4 sm:right-8 w-72'
                : 'bottom-0 right-3 left-3 sm:left-auto sm:right-8 sm:w-[540px]'
          }`}
        >
          <div
            onClick={() => composeMinimized && setComposeMinimized(false)}
            className="bg-slate-900 text-white px-4 py-2.5 rounded-t-xl flex items-center justify-between cursor-pointer"
          >
            <span className="text-xs font-medium tracking-wide">New Message</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setComposeMinimized((prev) => !prev);
                  setComposeExpanded(false);
                }}
                aria-label="Minimize"
                className="p-1 text-slate-300 hover:text-white rounded cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setComposeExpanded((prev) => !prev);
                  setComposeMinimized(false);
                }}
                aria-label="Expand"
                className="p-1 text-slate-300 hover:text-white rounded cursor-pointer hidden sm:inline-flex"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseCompose();
                }}
                aria-label="Close"
                className="p-1 text-slate-300 hover:text-white rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {!composeMinimized && (
            <form onSubmit={handleComposeSubmit} className="flex flex-col flex-1">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-xs">
                <span className="text-slate-400 w-10">From</span>
                <select
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value)}
                  className="flex-1 bg-transparent font-mono text-slate-800 focus:outline-none py-1"
                >
                  {mailboxes
                    .filter((m) => m.enabled)
                    .map((m) => (
                      <option key={m.id} value={m.localPart}>
                        {m.localPart}@{config.domain}
                      </option>
                    ))}
                </select>
              </div>
              <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-xs">
                <span className="text-slate-400 w-10">To</span>
                <input
                  type="email"
                  required
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder={`recipient@${config.domain}`}
                  className="flex-1 bg-transparent text-slate-900 focus:outline-none py-1 font-mono"
                />
              </div>
              <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 text-xs">
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full bg-transparent text-sm text-slate-900 focus:outline-none py-1"
                />
              </div>
              <textarea
                required
                rows={composeExpanded ? 16 : 9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email..."
                className="w-full flex-1 px-4 py-3 text-sm text-slate-800 focus:outline-none resize-none"
              />
              <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                  <span className="text-[11px] text-slate-400 font-mono">
                    DKIM RSA-2048
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setToAddress('');
                    setSubject('');
                    setBody('');
                    onCloseCompose();
                  }}
                  aria-label="Discard draft"
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
