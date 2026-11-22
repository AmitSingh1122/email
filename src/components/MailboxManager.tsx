import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { DomainConfig, MailboxAccount } from '../types/mail';

interface MailboxManagerProps {
  config: DomainConfig;
  mailboxes: MailboxAccount[];
  onCreateMailbox: (payload: {
    localPart: string;
    displayName: string;
    role: string;
    quotaMb: number;
  }) => Promise<void>;
  onToggleMailbox: (id: string, enabled: boolean) => Promise<void>;
  onDeleteMailbox: (id: string) => Promise<void>;
}

export function MailboxManager({
  config,
  mailboxes,
  onCreateMailbox,
  onToggleMailbox,
  onDeleteMailbox,
}: MailboxManagerProps) {
  const [showAddMailbox, setShowAddMailbox] = useState(false);
  const [newLocalPart, setNewLocalPart] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('Operations');
  const [newQuota, setNewQuota] = useState(5120);
  const [mailboxError, setMailboxError] = useState<string | null>(null);

  const handleCreateMailboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMailboxError(null);
    if (!newLocalPart.trim()) {
      setMailboxError(`Please enter a mailbox username before @${config.domain}`);
      return;
    }
    try {
      await onCreateMailbox({
        localPart: newLocalPart.trim(),
        displayName: newDisplayName.trim() || newLocalPart.trim(),
        role: newRole.trim() || 'Team Mailbox',
        quotaMb: newQuota,
      });
      setNewLocalPart('');
      setNewDisplayName('');
      setShowAddMailbox(false);
    } catch (err) {
      setMailboxError(err instanceof Error ? err.message : 'Unable to create mailbox');
    }
  };

  return (
    <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Domain Mailboxes ({config.domain})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Virtual accounts synced to Postfix{' '}
            <span className="font-mono">/etc/postfix/vmailbox</span> and Dovecot Maildir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddMailbox((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Mailbox
        </button>
      </div>

      {showAddMailbox && (
        <form
          onSubmit={handleCreateMailboxSubmit}
          className="p-6 border-b border-slate-200 bg-slate-50/70 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Username (@{config.domain})
              </label>
              <input
                type="text"
                required
                value={newLocalPart}
                onChange={(e) => setNewLocalPart(e.target.value)}
                placeholder="billing"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Billing Desk"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Role / Purpose
              </label>
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Quota (MB)
              </label>
              <input
                type="number"
                min={256}
                max={102400}
                value={newQuota}
                onChange={(e) => setNewQuota(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono tabular-nums"
              />
            </div>
          </div>
          {mailboxError && <p className="text-xs text-red-600">{mailboxError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddMailbox(false)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 cursor-pointer"
            >
              Create Mailbox
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <th className="py-3 px-6">Email Address</th>
              <th className="py-3 px-4">Display Name</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4 text-right">Storage Used</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {mailboxes.map((mbx) => (
              <tr key={mbx.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-6 font-mono text-xs text-slate-900">
                  {mbx.localPart}@{config.domain}
                </td>
                <td className="py-3.5 px-4 text-slate-800">{mbx.displayName}</td>
                <td className="py-3.5 px-4 text-xs text-slate-500">{mbx.role}</td>
                <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                  {mbx.usedMb} MB / {mbx.quotaMb} MB
                </td>
                <td className="py-3.5 px-4 text-xs font-medium">
                  <span className={mbx.enabled ? 'text-emerald-700' : 'text-slate-500'}>
                    {mbx.enabled ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="py-3.5 px-6 text-right space-x-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onToggleMailbox(mbx.id, !mbx.enabled)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    {mbx.enabled ? 'Suspend' : 'Enable'}
                  </button>
                  {mailboxes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteMailbox(mbx.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
