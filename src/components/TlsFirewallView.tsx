import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DomainConfig, TlsMode } from '../types/mail';
import { generateFirewallAndFail2ban } from '../utils/configGenerators';
import { CodeBlock } from './CodeBlock';

interface TlsFirewallViewProps {
  config: DomainConfig;
  onSaveConfig: (patch: Partial<DomainConfig>) => Promise<void>;
}

export function TlsFirewallView({ config, onSaveConfig }: TlsFirewallViewProps) {
  const [tlsMode, setTlsMode] = useState<TlsMode>(config.tlsMode);
  const [tlsEmail, setTlsEmail] = useState(config.tlsEmail);
  const [enableFirewall, setEnableFirewall] = useState(config.enableFirewall);
  const [sshPort, setSshPort] = useState(config.sshPort);
  const [allowedSshCidr, setAllowedSshCidr] = useState(config.allowedSshCidr);
  const [enableFail2ban, setEnableFail2ban] = useState(config.enableFail2ban);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTlsMode(config.tlsMode);
    setTlsEmail(config.tlsEmail);
    setEnableFirewall(config.enableFirewall);
    setSshPort(config.sshPort);
    setAllowedSshCidr(config.allowedSshCidr);
    setEnableFail2ban(config.enableFail2ban);
  }, [config]);

  const previewConfig: DomainConfig = {
    ...config,
    tlsMode,
    tlsEmail,
    enableFirewall,
    sshPort: Number(sshPort) || 22,
    allowedSshCidr,
    enableFail2ban,
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveConfig({
        tlsMode,
        tlsEmail: tlsEmail.trim(),
        enableFirewall,
        sshPort: Number(sshPort) || 22,
        allowedSshCidr: allowedSshCidr.trim(),
        enableFail2ban,
      });
    } finally {
      setSaving(false);
    }
  };

  const firewallRules = [
    {
      port: `${Number(sshPort) || 22}/tcp`,
      service: 'OpenSSH Administration',
      source: allowedSshCidr.trim() || 'Any (Consider restricting to admin IP)',
      action: 'ALLOW',
    },
    {
      port: '25/tcp',
      service: 'Postfix Inbound SMTP',
      source: '0.0.0.0/0 (Required for global MX delivery)',
      action: 'ALLOW',
    },
    {
      port: '587/tcp',
      service: 'Postfix Submission (STARTTLS)',
      source: '0.0.0.0/0 (SASL Auth Required)',
      action: config.enableSubmission587 ? 'ALLOW' : 'DENY',
    },
    {
      port: '465/tcp',
      service: 'Postfix SMTPS (Implicit TLS)',
      source: '0.0.0.0/0 (SASL Auth Required)',
      action: config.enableSmtps465 ? 'ALLOW' : 'DENY',
    },
    {
      port: '143/tcp',
      service: 'Dovecot IMAP (STARTTLS Only)',
      source: '0.0.0.0/0 (Plaintext auth disabled)',
      action: 'ALLOW',
    },
    {
      port: '993/tcp',
      service: 'Dovecot IMAPS (Implicit TLS)',
      source: '0.0.0.0/0 (TLSv1.2+ Required)',
      action: config.enableImaps993 ? 'ALLOW' : 'DENY',
    },
    {
      port: '80, 443/tcp',
      service: 'Certbot ACME & HTTPS',
      source: '0.0.0.0/0',
      action: 'ALLOW',
    },
    {
      port: 'All Other Ports',
      service: 'Default Inbound Policy',
      source: 'Any',
      action: 'DENY',
    },
  ];

  return (
    <div className="space-y-8">
      {/* TLS & Firewall Settings Form */}
      <section className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="pb-5 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            TLS Encryption & Perimeter Firewall Rules
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enforce end-to-end TLS encryption for SMTP/IMAP data transfer and block unauthorized network access via UFW and Fail2ban.
          </p>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                TLS Certificate Provider
              </label>
              <select
                value={tlsMode}
                onChange={(e) => setTlsMode(e.target.value as TlsMode)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900"
              >
                <option value="letsencrypt">Let’s Encrypt (Certbot Auto-Renew)</option>
                <option value="custom_pem">Custom Commercial CA PEM</option>
                <option value="self_signed">Self-Signed (Staging Only)</option>
              </select>
              <p className="mt-1 text-xs text-slate-500 font-mono">
                CN: {config.mailHostname} · Protocols: TLSv1.2, TLSv1.3
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                ACME / Security Contact Email
              </label>
              <input
                type="email"
                required
                value={tlsEmail}
                onChange={(e) => setTlsEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500">
                Receives Let’s Encrypt expiry notices and renewal alerts.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-slate-200">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                SSH Port
              </label>
              <input
                type="number"
                min={1}
                max={65535}
                value={sshPort}
                onChange={(e) => setSshPort(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono tabular-nums text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Allowed SSH Source CIDR (Optional Restriction)
              </label>
              <input
                type="text"
                value={allowedSshCidr}
                onChange={(e) => setAllowedSshCidr(e.target.value)}
                placeholder="e.g. 203.0.113.10/32 or 0.0.0.0/0"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50/70">
              <input
                type="checkbox"
                checked={enableFirewall}
                onChange={(e) => setEnableFirewall(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Enforce UFW Default-Deny Firewall
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Drops all unsolicited inbound ports except mail, ACME, and SSH.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-md cursor-pointer hover:bg-slate-50/70">
              <input
                type="checkbox"
                checked={enableFail2ban}
                onChange={(e) => setEnableFail2ban(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Enable Fail2ban Brute-Force Jails
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Auto-bans IPs after 3 failed Postfix SASL or 5 failed Dovecot IMAP logins.
                </div>
              </div>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Security & Firewall Policy'}
            </button>
          </div>
        </form>
      </section>

      {/* Firewall Rule Matrix */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">UFW Port Access Matrix</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit ingress policy applied on the private host network interface.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                <th className="py-3 px-6">Port / Protocol</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Allowed Source</th>
                <th className="py-3 px-6 text-right">Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {firewallRules.map((rule) => (
                <tr key={rule.port} className="hover:bg-slate-50/70">
                  <td className="py-3 px-6 font-mono font-medium text-slate-900 tabular-nums">
                    {rule.port}
                  </td>
                  <td className="py-3 px-4 text-slate-800">{rule.service}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{rule.source}</td>
                  <td className="py-3 px-6 text-right font-mono font-semibold">
                    <span className={rule.action === 'ALLOW' ? 'text-emerald-700' : 'text-red-700'}>
                      {rule.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* UFW & Fail2ban Script */}
      <CodeBlock
        title="/root/ufw-and-fail2ban.sh"
        subtitle="Idempotent bash script applying UFW ingress rules and Fail2ban Postfix/Dovecot jails"
        code={generateFirewallAndFail2ban(previewConfig)}
        filename="ufw-and-fail2ban.sh"
      />
    </div>
  );
}
