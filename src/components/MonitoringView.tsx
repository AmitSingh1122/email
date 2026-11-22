import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DomainConfig, MailLogEntry } from '../types/mail';
import { generateMonitoringConfig } from '../utils/configGenerators';
import { CodeBlock } from './CodeBlock';

interface MonitoringViewProps {
  config: DomainConfig;
  logs: MailLogEntry[];
  onToggleMonitoring: (enabled: boolean) => Promise<void>;
}

const SERVICES: Array<{ value: 'all' | MailLogEntry['service']; label: string }> = [
  { value: 'all', label: 'All Services' },
  { value: 'postfix/smtpd', label: 'postfix/smtpd' },
  { value: 'postfix/smtp', label: 'postfix/smtp' },
  { value: 'dovecot/imap', label: 'dovecot/imap' },
  { value: 'opendkim', label: 'opendkim' },
  { value: 'fail2ban', label: 'fail2ban' },
  { value: 'ufw', label: 'ufw' },
  { value: 'pipeline', label: 'pipeline' },
];

export function MonitoringView({
  config,
  logs,
  onToggleMonitoring,
}: MonitoringViewProps) {
  const [serviceFilter, setServiceFilter] = useState<'all' | MailLogEntry['service']>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | MailLogEntry['severity']>('all');
  const [query, setQuery] = useState('');

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (serviceFilter !== 'all' && entry.service !== serviceFilter) return false;
      if (severityFilter !== 'all' && entry.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.service.toLowerCase().includes(q) ||
        entry.queueId.toLowerCase().includes(q)
      );
    });
  }, [logs, serviceFilter, severityFilter, query]);

  const counts = useMemo(
    () => ({
      total: logs.length,
      warnings: logs.filter((l) => l.severity === 'warning').length,
      errors: logs.filter((l) => l.severity === 'error').length,
    }),
    [logs]
  );

  return (
    <div className="space-y-8">
      {/* Monitoring Summary & Controls */}
      <section className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              System Log Monitoring & Telemetry Stack
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks Postfix queue events, Dovecot IMAP sessions, OpenDKIM signatures, Fail2ban bans, and deployment updates.
            </p>
          </div>
          <label className="inline-flex items-center gap-2.5 px-3.5 py-2 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={config.enableMonitoring}
              onChange={(e) => onToggleMonitoring(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <span className="text-xs font-medium text-slate-800">
              Promtail + Logwatch Digest Enabled
            </span>
          </label>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-slate-500">Captured Log Events</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
              {counts.total}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Security & Policy Warnings</div>
            <div className="mt-1 text-xl font-semibold text-amber-700 tabular-nums">
              {counts.warnings}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Delivery / Socket Errors</div>
            <div className="mt-1 text-xl font-semibold text-red-700 tabular-nums">
              {counts.errors}
            </div>
          </div>
        </div>
      </section>

      {/* Mail Log Explorer */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/40">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={serviceFilter}
              onChange={(e) =>
                setServiceFilter(e.target.value as 'all' | MailLogEntry['service'])
              }
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800 font-mono"
            >
              {SERVICES.map((svc) => (
                <option key={svc.value} value={svc.value}>
                  {svc.label}
                </option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) =>
                setSeverityFilter(e.target.value as 'all' | MailLogEntry['severity'])
              }
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-800"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter queue ID, message, host..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
              <tr>
                <th className="py-2.5 px-6 w-44">Timestamp</th>
                <th className="py-2.5 px-3 w-32">Service</th>
                <th className="py-2.5 px-3 w-24">Queue ID</th>
                <th className="py-2.5 px-3 w-24">Level</th>
                <th className="py-2.5 px-6">Log Entry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center font-sans text-slate-500">
                    No matching mail log entries found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-2.5 px-6 text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900 whitespace-nowrap">
                      {log.service}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {log.queueId}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-sans font-medium">
                      <span
                        className={
                          log.severity === 'error'
                            ? 'text-red-700'
                            : log.severity === 'warning'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }
                      >
                        {log.severity === 'error'
                          ? 'Error'
                          : log.severity === 'warning'
                            ? 'Warning'
                            : 'Info'}
                      </span>
                    </td>
                    <td className="py-2.5 px-6 text-slate-800 break-words">{log.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Promtail & Logwatch Monitoring Config */}
      <CodeBlock
        title="/etc/promtail/config.yml & Logwatch Digest"
        subtitle="Ships /var/log/mail.log and /var/log/fail2ban.log into centralized monitoring"
        code={generateMonitoringConfig(config)}
        filename="promtail-mail.yml"
      />
    </div>
  );
}
