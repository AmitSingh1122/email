import { Activity, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DomainConfig, MailboxAccount, PortProbeResult } from '../types/mail';
import {
  generateDovecotConf,
  generatePostfixMainCf,
  generatePostfixMasterCf,
} from '../utils/configGenerators';
import { CodeBlock } from './CodeBlock';

interface ProtocolsViewProps {
  config: DomainConfig;
  mailboxes: MailboxAccount[];
  onSaveConfig: (patch: Partial<DomainConfig>) => Promise<void>;
}

export function ProtocolsView({ config, mailboxes, onSaveConfig }: ProtocolsViewProps) {
  const [domain, setDomain] = useState(config.domain);
  const [mailHostname, setMailHostname] = useState(config.mailHostname);
  const [serverIp, setServerIp] = useState(config.serverIp);
  const [enableSubmission587, setEnableSubmission587] = useState(config.enableSubmission587);
  const [enableSmtps465, setEnableSmtps465] = useState(config.enableSmtps465);
  const [enableImaps993, setEnableImaps993] = useState(config.enableImaps993);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const [activeFileTab, setActiveFileTab] = useState<'main' | 'master' | 'dovecot'>('main');

  // Live TCP/TLS port probe state
  const [probeHost, setProbeHost] = useState(config.mailHostname);
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState<PortProbeResult[] | null>(null);
  const [probeCheckedAt, setProbeCheckedAt] = useState<string | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  useEffect(() => {
    setDomain(config.domain);
    setMailHostname(config.mailHostname);
    setServerIp(config.serverIp);
    setEnableSubmission587(config.enableSubmission587);
    setEnableSmtps465(config.enableSmtps465);
    setEnableImaps993(config.enableImaps993);
    setProbeHost(config.mailHostname);
  }, [config]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      await onSaveConfig({
        domain: domain.trim().toLowerCase(),
        mailHostname: mailHostname.trim().toLowerCase(),
        serverIp: serverIp.trim(),
        enableSubmission587,
        enableSmtps465,
        enableImaps993,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleProbePorts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!probeHost.trim()) return;
    setProbing(true);
    setProbeError(null);
    try {
      const res = await fetch('/api/network/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: probeHost.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Probe failed');
      setProbeResults(data.results);
      setProbeCheckedAt(data.checkedAt);
    } catch (err) {
      setProbeError(err instanceof Error ? err.message : 'Unable to probe ports');
    } finally {
      setProbing(false);
    }
  };

  const previewConfig: DomainConfig = {
    ...config,
    domain: domain.trim().toLowerCase() || config.domain,
    mailHostname: mailHostname.trim().toLowerCase() || config.mailHostname,
    serverIp: serverIp.trim() || config.serverIp,
    enableSubmission587,
    enableSmtps465,
    enableImaps993,
  };

  return (
    <div className="space-y-8">
      {/* Identity & SMTP/IMAP Listener Form */}
      <section className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Domain Identity & Postfix / Dovecot Protocol Matrix
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure your private server FQDN, domain name, and encrypted SMTP/IMAP listener ports.
            </p>
          </div>
          {savedNotice && (
            <span className="text-xs font-medium text-emerald-700">
              Saved & synchronized to README.md
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Primary Email Domain
              </label>
              <input
                type="text"
                required
                value={domain}
                onChange={(e) => {
                  const val = e.target.value;
                  setDomain(val);
                  if (mailHostname === `mail.${domain}` || !mailHostname) {
                    setMailHostname(`mail.${val}`);
                  }
                }}
                placeholder="yourdomain.com"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">Used for @domain addresses and MX routing.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Mail Server Hostname (FQDN)
              </label>
              <input
                type="text"
                required
                value={mailHostname}
                onChange={(e) => setMailHostname(e.target.value)}
                placeholder="mail.yourdomain.com"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">Must match Postfix myhostname & PTR record.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Private Server Public IPv4
              </label>
              <input
                type="text"
                required
                value={serverIp}
                onChange={(e) => setServerIp(e.target.value)}
                placeholder="203.0.113.42"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">Target IP for A, SPF, and PTR records.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50/70">
              <input
                type="checkbox"
                checked={enableSubmission587}
                onChange={(e) => setEnableSubmission587(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  SMTP Submission · Port 587
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Enforces STARTTLS + Dovecot SASL auth for outbound sending.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50/70">
              <input
                type="checkbox"
                checked={enableSmtps465}
                onChange={(e) => setEnableSmtps465(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  SMTPS Implicit TLS · Port 465
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Wraps SMTP immediately in TLS for legacy & mobile clients.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50/70">
              <input
                type="checkbox"
                checked={enableImaps993}
                onChange={(e) => setEnableImaps993(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Dovecot IMAPS · Port 993
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Encrypted Maildir retrieval with plaintext login disabled.
                </div>
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Protocol Settings'}
            </button>
          </div>
        </form>
      </section>

      {/* Live Socket & TLS Port Probe */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live SMTP & IMAP Port Reachability Probe
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Opens live TCP and TLS sockets from the backend to test ports 25, 587, 465, 143, and 993 (try your host or e.g. <span className="font-mono">smtp.gmail.com</span>).
            </p>
          </div>
          <form onSubmit={handleProbePorts} className="flex items-center gap-2">
            <input
              type="text"
              value={probeHost}
              onChange={(e) => setProbeHost(e.target.value)}
              placeholder="mail.yourdomain.com"
              className="w-56 px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={probing}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Activity className="w-3.5 h-3.5" />
              {probing ? 'Probing...' : 'Probe Ports'}
            </button>
          </form>
        </div>

        {probeError && (
          <div className="px-6 py-3 text-xs text-red-700 bg-red-50 border-b border-red-200">
            {probeError}
          </div>
        )}

        {probeResults ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                  <th className="py-3 px-6">Port</th>
                  <th className="py-3 px-4">Service</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4">TLS Status</th>
                  <th className="py-3 px-4">Banner / Diagnostic</th>
                  <th className="py-3 px-6 text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {probeResults.map((row) => (
                  <tr key={row.port} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-mono font-medium text-slate-900 tabular-nums">
                      {row.port}/tcp
                    </td>
                    <td className="py-3 px-4 text-slate-700">{row.service}</td>
                    <td className="py-3 px-4 font-medium">
                      <span className={row.reachable ? 'text-emerald-700' : 'text-red-700'}>
                        {row.reachable ? 'Reachable' : 'Blocked / Closed'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {row.tlsProtocol || (row.tlsSupported ? 'STARTTLS' : 'None')}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 max-w-sm truncate">
                      {row.banner || row.error || '—'}
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums text-slate-700">
                      {row.latencyMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {probeCheckedAt && (
              <div className="px-6 py-2.5 text-xs text-slate-500 border-t border-slate-200 bg-slate-50/40 tabular-nums">
                Checked host {probeHost} at {new Date(probeCheckedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-xs text-slate-500">
            Click <span className="font-medium text-slate-700">Probe Ports</span> to run live TCP and TLS handshake checks against ports 25, 587, 465, 143, and 993.
          </div>
        )}
      </section>

      {/* Generated Postfix & Dovecot Configurations */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Generated Postfix & Dovecot Server Configs
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ready-to-deploy production templates reflecting your active domain, TLS paths, and mailboxes.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveFileTab('main')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeFileTab === 'main'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Postfix main.cf
            </button>
            <button
              type="button"
              onClick={() => setActiveFileTab('master')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeFileTab === 'master'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Postfix master.cf
            </button>
            <button
              type="button"
              onClick={() => setActiveFileTab('dovecot')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeFileTab === 'dovecot'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dovecot IMAP/LMTP
            </button>
          </div>
        </div>

        {activeFileTab === 'main' && (
          <CodeBlock
            title="/etc/postfix/main.cf"
            subtitle="Core MTA identity, TLS cipher hardening, SASL auth, and OpenDKIM milter hooks"
            code={generatePostfixMainCf(previewConfig)}
            filename="main.cf"
          />
        )}
        {activeFileTab === 'master' && (
          <CodeBlock
            title="/etc/postfix/master.cf"
            subtitle="SMTP (25), Submission STARTTLS (587), and SMTPS (465) service matrix"
            code={generatePostfixMasterCf(previewConfig)}
            filename="master.cf"
          />
        )}
        {activeFileTab === 'dovecot' && (
          <CodeBlock
            title="/etc/dovecot/conf.d/99-postforge.conf"
            subtitle="IMAP/IMAPS Maildir delivery, TLSv1.2+ enforcement, and Postfix LMTP/SASL sockets"
            code={generateDovecotConf(previewConfig, mailboxes)}
            filename="99-postforge.conf"
          />
        )}
      </section>
    </div>
  );
}
