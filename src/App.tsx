import {
  Activity,
  ArrowLeft,
  Download,
  GitBranch,
  Globe,
  Inbox,
  Lock,
  Menu,
  Pencil,
  Search,
  Send,
  Server,
  Settings,
  ShieldAlert,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeploymentReadmeView } from './components/DeploymentReadmeView';
import { DnsSecurityView } from './components/DnsSecurityView';
import { MailboxManager } from './components/MailboxManager';
import { MailboxView, type MailViewFolder } from './components/MailboxView';
import { MonitoringView } from './components/MonitoringView';
import { ProtocolsView } from './components/ProtocolsView';
import { TlsFirewallView } from './components/TlsFirewallView';
import type { DomainConfig, PlatformState, StepStatus } from './types/mail';

type AdminSection =
  | 'mailboxes'
  | 'protocols'
  | 'dns'
  | 'security'
  | 'monitoring'
  | 'deployment';

const ADMIN_NAV_ITEMS: Array<{
  id: AdminSection;
  label: string;
  breadcrumb: string;
  icon: typeof Server;
}> = [
  { id: 'mailboxes', label: 'Domain Mailboxes', breadcrumb: 'Domain Mailboxes', icon: Users },
  { id: 'protocols', label: 'SMTP & IMAP Stack', breadcrumb: 'SMTP & IMAP (Postfix / Dovecot)', icon: Server },
  { id: 'dns', label: 'DNS, DKIM & SPF', breadcrumb: 'DNS, DKIM & SPF', icon: Globe },
  { id: 'security', label: 'TLS & Firewall', breadcrumb: 'TLS Encryption & UFW Firewall', icon: Lock },
  { id: 'monitoring', label: 'Logs & Monitoring', breadcrumb: 'Mail Logs & Monitoring', icon: Activity },
  { id: 'deployment', label: 'Pipeline & README', breadcrumb: 'Deployment Pipeline & README', icon: GitBranch },
];

export default function App() {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mode: 'mail' (Gmail interface) vs 'admin' (hidden infrastructure settings)
  const [mode, setMode] = useState<'mail' | 'admin'>('mail');
  const [adminSection, setAdminSection] = useState<AdminSection>('dns');

  // Gmail workspace state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mailFolder, setMailFolder] = useState<MailViewFolder>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [composeOpen, setComposeOpen] = useState(false);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as PlatformState;
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to mail platform server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleSaveConfig = async (patch: Partial<DomainConfig>) => {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save configuration');
    setState(data);
  };

  const handleRegenerateDkim = async (selector: string) => {
    const res = await fetch('/api/dkim/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to regenerate DKIM keys');
    setState(data);
  };

  const handleSendEmail = async (payload: {
    fromLocal: string;
    to: string;
    subject: string;
    body: string;
  }) => {
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send email');
    setState(data);
  };

  const handleSimulateInbound = async (payload: {
    from: string;
    toLocal: string;
    subject: string;
    body: string;
    spfStatus: 'pass' | 'softfail' | 'fail';
    dkimSigned: boolean;
  }) => {
    const res = await fetch('/api/messages/simulate-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to simulate inbound email');
    setState(data);
  };

  const handleMarkRead = async (id: string) => {
    const res = await fetch(`/api/messages/${id}/read`, { method: 'PATCH' });
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  };

  const handleCreateMailbox = async (payload: {
    localPart: string;
    displayName: string;
    role: string;
    quotaMb: number;
  }) => {
    const res = await fetch('/api/mailboxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create mailbox');
    setState(data);
  };

  const handleToggleMailbox = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/mailboxes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  };

  const handleDeleteMailbox = async (id: string) => {
    const res = await fetch(`/api/mailboxes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  };

  const handleUpdateStepStatus = async (stepId: string, status: StepStatus) => {
    const res = await fetch(`/api/deployment/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update deployment step');
    setState(data);
  };

  const handleDownloadBundle = () => {
    window.location.href = '/api/bundle';
  };

  const unreadInboxCount = useMemo(() => {
    if (!state) return 0;
    return state.messages.filter((m) => m.folder === 'inbox' && !m.read).length;
  }, [state]);

  const spamCount = useMemo(() => {
    if (!state) return 0;
    return state.messages.filter((m) => m.folder === 'quarantine').length;
  }, [state]);

  const activeAdminNav =
    ADMIN_NAV_ITEMS.find((n) => n.id === adminSection) ?? ADMIN_NAV_ITEMS[0];

  const renderMailSidebar = () => (
    <div className="flex flex-col h-full py-3 px-3">
      <div className="mb-4 px-1">
        <button
          type="button"
          onClick={() => {
            setComposeOpen(true);
            setMobileMenuOpen(false);
          }}
          className="inline-flex items-center gap-3 px-5 py-3.5 text-sm font-medium text-[#001D35] bg-[#C2E7FF] hover:bg-[#B3DDF9] rounded-2xl shadow-sm hover:shadow transition-all cursor-pointer whitespace-nowrap"
        >
          <Pencil className="w-4 h-4 shrink-0" />
          <span>Compose</span>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5" aria-label="Mail folders">
        <button
          type="button"
          onClick={() => {
            setMailFolder('inbox');
            setMobileMenuOpen(false);
          }}
          className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            mailFolder === 'inbox'
              ? 'bg-[#D3E3FD] text-[#041E49] font-semibold'
              : 'text-slate-700 hover:bg-slate-200/60 font-medium'
          }`}
        >
          <span className="flex items-center gap-3">
            <Inbox className="w-4 h-4 shrink-0" />
            <span>Inbox</span>
          </span>
          {unreadInboxCount > 0 && (
            <span className="text-xs font-semibold tabular-nums">{unreadInboxCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMailFolder('starred');
            setMobileMenuOpen(false);
          }}
          className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            mailFolder === 'starred'
              ? 'bg-[#D3E3FD] text-[#041E49] font-semibold'
              : 'text-slate-700 hover:bg-slate-200/60 font-medium'
          }`}
        >
          <span className="flex items-center gap-3">
            <Star className="w-4 h-4 shrink-0" />
            <span>Starred</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMailFolder('sent');
            setMobileMenuOpen(false);
          }}
          className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            mailFolder === 'sent'
              ? 'bg-[#D3E3FD] text-[#041E49] font-semibold'
              : 'text-slate-700 hover:bg-slate-200/60 font-medium'
          }`}
        >
          <span className="flex items-center gap-3">
            <Send className="w-4 h-4 shrink-0" />
            <span>Sent</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMailFolder('quarantine');
            setMobileMenuOpen(false);
          }}
          className={`w-full flex items-center justify-between px-4 py-2 text-sm rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            mailFolder === 'quarantine'
              ? 'bg-[#D3E3FD] text-[#041E49] font-semibold'
              : 'text-slate-700 hover:bg-slate-200/60 font-medium'
          }`}
        >
          <span className="flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Spam</span>
          </span>
          {spamCount > 0 && (
            <span className="text-xs font-medium tabular-nums">{spamCount}</span>
          )}
        </button>
      </nav>

      <div className="pt-3 mt-3 border-t border-slate-200/80">
        <button
          type="button"
          onClick={() => {
            setMode('admin');
            setMobileMenuOpen(false);
          }}
          className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer whitespace-nowrap"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>Domain & Server Setup</span>
        </button>
      </div>
    </div>
  );

  const renderAdminSidebar = () => (
    <div className="flex flex-col h-full py-4 px-3">
      <div className="mb-4 px-1">
        <button
          type="button"
          onClick={() => {
            setMode('mail');
            setMobileMenuOpen(false);
          }}
          className="w-full inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Mail
        </button>
      </div>

      <nav className="flex-1 space-y-1" aria-label="Server configuration">
        {ADMIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = adminSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setAdminSection(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-slate-900 flex flex-col">
      {/* Top Gmail-Style Header */}
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 bg-[#F6F8FC]">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 1024) {
                setMobileMenuOpen((prev) => !prev);
              } else {
                setSidebarCollapsed((prev) => !prev);
              }
            }}
            aria-label="Toggle navigation"
            className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setMode('mail')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            PostForge
          </button>
        </div>

        {/* Center Zone: Gmail Search Bar in Mail Mode, Breadcrumb in Admin Mode */}
        {mode === 'mail' ? (
          <div className="flex-1 max-w-2xl mx-auto">
            <div className="relative flex items-center bg-[#EAF1FB] hover:bg-[#E2ECF9] focus-within:bg-white focus-within:shadow-md border border-transparent focus-within:border-slate-200 rounded-full transition-all">
              <Search className="w-4 h-4 text-slate-500 ml-4 shrink-0 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in mail"
                className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2 text-sm min-w-0 truncate px-2">
            <span className="text-slate-400 font-medium whitespace-nowrap">
              Domain & Server Setup
            </span>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <h1 className="font-semibold text-slate-900 truncate">
              {activeAdminNav.breadcrumb}
            </h1>
          </div>
        )}

        {/* Right Zone: Account Switcher & Settings / Export */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === 'mail' ? (
            <>
              {state && (
                <select
                  aria-label="Active mailbox filter"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="hidden sm:block px-3 py-1.5 text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-full hover:bg-slate-50 focus:outline-none cursor-pointer"
                >
                  <option value="all">All @{state.config.domain}</option>
                  {state.mailboxes.map((mbx) => (
                    <option key={mbx.id} value={mbx.localPart}>
                      {mbx.localPart}@{state.config.domain}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setMode('admin')}
                title="Domain & Server Settings"
                aria-label="Open Domain and Server Settings"
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-full transition-colors cursor-pointer"
              >
                <Settings className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleDownloadBundle}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Bundle
            </button>
          )}
        </div>
      </header>

      {/* Main Body Layout */}
      <div className="flex flex-1 min-w-0">
        {/* Desktop Sidebar */}
        {!sidebarCollapsed && (
          <aside className="hidden lg:block w-[240px] shrink-0">
            <div className="sticky top-16 h-[calc(100vh-4rem)]">
              {mode === 'mail' ? renderMailSidebar() : renderAdminSidebar()}
            </div>
          </aside>
        )}

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-900/30"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-50 w-[250px] bg-[#F6F8FC] border-r border-slate-200 h-full pt-2">
              <div className="px-4 pb-2 flex items-center justify-between">
                <span className="font-display text-base font-bold text-slate-900">
                  PostForge
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {mode === 'mail' ? renderMailSidebar() : renderAdminSidebar()}
            </aside>
          </div>
        )}

        {/* Primary Viewport */}
        <main className="flex-1 min-w-0 px-3 sm:px-6 pb-6">
          {loading && !state ? (
            <div className="h-[75vh] bg-white border border-slate-200 rounded-2xl animate-pulse" />
          ) : error && !state ? (
            <div className="border border-red-200 bg-white rounded-2xl p-8 text-center max-w-lg mx-auto mt-12">
              <h2 className="text-base font-semibold text-slate-900">
                Unable to load mail platform state
              </h2>
              <p className="text-xs text-slate-600 mt-1">{error}</p>
              <button
                type="button"
                onClick={loadState}
                className="mt-4 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          ) : state ? (
            mode === 'mail' ? (
              <MailboxView
                config={state.config}
                mailboxes={state.mailboxes}
                messages={state.messages}
                folder={mailFolder}
                searchQuery={searchQuery}
                accountFilter={accountFilter}
                composeOpen={composeOpen}
                onOpenCompose={() => setComposeOpen(true)}
                onCloseCompose={() => setComposeOpen(false)}
                onRefresh={loadState}
                onSendEmail={handleSendEmail}
                onSimulateInbound={handleSimulateInbound}
                onMarkRead={handleMarkRead}
                onDeleteMessage={handleDeleteMessage}
              />
            ) : (
              <div className="max-w-6xl mx-auto pt-1">
                {adminSection === 'mailboxes' && (
                  <MailboxManager
                    config={state.config}
                    mailboxes={state.mailboxes}
                    onCreateMailbox={handleCreateMailbox}
                    onToggleMailbox={handleToggleMailbox}
                    onDeleteMailbox={handleDeleteMailbox}
                  />
                )}
                {adminSection === 'protocols' && (
                  <ProtocolsView
                    config={state.config}
                    mailboxes={state.mailboxes}
                    onSaveConfig={handleSaveConfig}
                  />
                )}
                {adminSection === 'dns' && (
                  <DnsSecurityView
                    config={state.config}
                    onSaveConfig={handleSaveConfig}
                    onRegenerateDkim={handleRegenerateDkim}
                  />
                )}
                {adminSection === 'security' && (
                  <TlsFirewallView config={state.config} onSaveConfig={handleSaveConfig} />
                )}
                {adminSection === 'monitoring' && (
                  <MonitoringView
                    config={state.config}
                    logs={state.logs}
                    onToggleMonitoring={(enabled) =>
                      handleSaveConfig({ enableMonitoring: enabled })
                    }
                  />
                )}
                {adminSection === 'deployment' && (
                  <DeploymentReadmeView
                    config={state.config}
                    mailboxes={state.mailboxes}
                    steps={state.deploymentSteps}
                    readmeMarkdown={state.readmeMarkdown}
                    onUpdateStepStatus={handleUpdateStepStatus}
                  />
                )}
              </div>
            )
          ) : null}
        </main>
      </div>
    </div>
  );
}
