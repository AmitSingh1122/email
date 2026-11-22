import { Check, Copy, Globe, KeyRound, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DnsCheckResult, DmarcPolicy, DomainConfig, SpfPolicy } from '../types/mail';
import {
  generateCloudflareZoneFile,
  generateDnsRecords,
  generateOpenDkimConfig,
} from '../utils/configGenerators';
import { CodeBlock } from './CodeBlock';

interface DnsSecurityViewProps {
  config: DomainConfig;
  onSaveConfig: (patch: Partial<DomainConfig>) => Promise<void>;
  onRegenerateDkim: (selector: string) => Promise<void>;
}

export function DnsSecurityView({
  config,
  onSaveConfig,
  onRegenerateDkim,
}: DnsSecurityViewProps) {
  const [dkimSelector, setDkimSelector] = useState(config.dkimSelector);
  const [spfPolicy, setSpfPolicy] = useState<SpfPolicy>(config.spfPolicy);
  const [spfInclude, setSpfInclude] = useState(config.spfInclude);
  const [dmarcPolicy, setDmarcPolicy] = useState<DmarcPolicy>(config.dmarcPolicy);
  const [dmarcRua, setDmarcRua] = useState(config.dmarcRua);

  const [saving, setSaving] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live DNS Lookup state
  const [lookupDomain, setLookupDomain] = useState(config.domain);
  const [lookupSelector, setLookupSelector] = useState(config.dkimSelector);
  const [checkingDns, setCheckingDns] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsCheckResult | null>(null);
  const [dnsError, setDnsError] = useState<string | null>(null);

  useEffect(() => {
    setDkimSelector(config.dkimSelector);
    setSpfPolicy(config.spfPolicy);
    setSpfInclude(config.spfInclude);
    setDmarcPolicy(config.dmarcPolicy);
    setDmarcRua(config.dmarcRua);
    setLookupDomain(config.domain);
    setLookupSelector(config.dkimSelector);
  }, [config]);

  const previewConfig: DomainConfig = {
    ...config,
    dkimSelector: dkimSelector.trim() || config.dkimSelector,
    spfPolicy,
    spfInclude,
    dmarcPolicy,
    dmarcRua,
  };

  const dnsRecords = generateDnsRecords(previewConfig);

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveConfig({
        dkimSelector: dkimSelector.trim() || 'mail2026',
        spfPolicy,
        spfInclude: spfInclude.trim(),
        dmarcPolicy,
        dmarcRua: dmarcRua.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDkim = async () => {
    setGeneratingKey(true);
    try {
      await onRegenerateDkim(dkimSelector.trim() || 'mail2026');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyValue = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore
    }
  };

  const handleVerifyDns = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupDomain.trim()) return;
    setCheckingDns(true);
    setDnsError(null);
    try {
      const res = await fetch('/api/dns/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: lookupDomain.trim(),
          selector: lookupSelector.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'DNS lookup failed');
      setDnsResult(data);
    } catch (err) {
      setDnsError(err instanceof Error ? err.message : 'Unable to resolve DNS records');
    } finally {
      setCheckingDns(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* DKIM, SPF, DMARC Policy Builder */}
      <section className="border border-slate-200 bg-white rounded-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Deliverability Policies: DKIM, SPF & DMARC
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Prevent spam folder placement and domain spoofing with RSA-2048 DKIM signing and strict SPF/DMARC alignment.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateDkim}
            disabled={generatingKey}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {generatingKey ? 'Generating RSA-2048...' : 'Rotate RSA-2048 DKIM Key'}
          </button>
        </div>

        <form onSubmit={handleSavePolicies} className="mt-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                DKIM Selector
              </label>
              <input
                type="text"
                required
                value={dkimSelector}
                onChange={(e) => setDkimSelector(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500 font-mono truncate">
                {dkimSelector}._domainkey.{config.domain}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                SPF Enforcement Mode
              </label>
              <select
                value={spfPolicy}
                onChange={(e) => setSpfPolicy(e.target.value as SpfPolicy)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="-all">Hard Fail (-all) · Recommended</option>
                <option value="~all">Soft Fail (~all) · Transitional</option>
                <option value="?all">Neutral (?all) · Testing only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Optional SPF Includes
              </label>
              <input
                type="text"
                value={spfInclude}
                onChange={(e) => setSpfInclude(e.target.value)}
                placeholder="e.g. relay.example.net"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                DMARC Policy
              </label>
              <select
                value={dmarcPolicy}
                onChange={(e) => setDmarcPolicy(e.target.value as DmarcPolicy)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="reject">p=reject (Block unauthenticated spoofing)</option>
                <option value="quarantine">p=quarantine (Route unaligned mail to spam)</option>
                <option value="none">p=none (Monitor aggregate reports only)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                DMARC Aggregate Report Address (rua)
              </label>
              <input
                type="email"
                value={dmarcRua}
                onChange={(e) => setDmarcRua(e.target.value)}
                placeholder={`postmaster@${config.domain}`}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-md font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <span className="text-xs text-slate-500 tabular-nums">
              Active RSA-2048 Key Generated: {new Date(config.dkimCreatedAt).toLocaleString()}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save DNS & Deliverability Policy'}
            </button>
          </div>
        </form>
      </section>

      {/* Required DNS Zone Records Table */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Required DNS Records for {config.domain}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Publish these exact records in your domain registrar DNS panel before sending production traffic.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
                <th className="py-3 px-6 w-20">Type</th>
                <th className="py-3 px-4 w-56">Host / Name</th>
                <th className="py-3 px-4">Record Value</th>
                <th className="py-3 px-4 w-32">Cloudflare Proxy</th>
                <th className="py-3 px-4 w-20 text-right">TTL</th>
                <th className="py-3 px-6 w-28 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {dnsRecords.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50/60 align-top">
                  <td className="py-3.5 px-6 font-mono font-semibold text-slate-900">{rec.type}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-800 break-all">
                    <div>{rec.host}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{rec.fqdn}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-slate-800 break-all leading-relaxed">
                      {rec.value}
                    </div>
                    <div className="text-slate-500 mt-1">{rec.purpose}</div>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                    {rec.type === 'A'
                      ? 'DNS Only (Off)'
                      : rec.type === 'PTR'
                        ? 'VPS Provider'
                        : 'DNS Record'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-600">
                    {rec.ttl}s
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      type="button"
                      onClick={() => handleCopyValue(rec.id, rec.value)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedId === rec.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cloudflare BIND Zone Import */}
      <CodeBlock
        title={`Cloudflare DNS Import (${config.domain}.zone)`}
        subtitle="In Cloudflare Dashboard -> DNS -> Records: disable Email Routing MX records, ensure the mail A record is DNS Only (Grey Cloud), or import this zone file."
        code={generateCloudflareZoneFile(previewConfig)}
        filename={`${config.domain}-cloudflare-dns.txt`}
      />

      {/* Live Public DNS Verifier */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Live Public DNS Resolver & Propagation Check
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Queries live DNS resolvers for MX, A, PTR, SPF, DKIM, and DMARC records (test your domain or e.g. <span className="font-mono">google.com</span>).
            </p>
          </div>
          <form onSubmit={handleVerifyDns} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={lookupDomain}
              onChange={(e) => setLookupDomain(e.target.value)}
              placeholder="yourdomain.com"
              className="w-48 px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900"
            />
            <input
              type="text"
              value={lookupSelector}
              onChange={(e) => setLookupSelector(e.target.value)}
              placeholder="selector"
              className="w-28 px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-md text-slate-900"
            />
            <button
              type="submit"
              disabled={checkingDns}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              {checkingDns ? 'Resolving...' : 'Verify Live DNS'}
            </button>
          </form>
        </div>

        {dnsError && (
          <div className="px-6 py-3 text-xs text-red-700 bg-red-50 border-b border-red-200">
            {dnsError}
          </div>
        )}

        {dnsResult ? (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs font-medium text-slate-500">MX Records</div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    dnsResult.mxRecords.length > 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {dnsResult.mxRecords.length > 0
                    ? `${dnsResult.mxRecords.length} Resolved`
                    : 'Not Found'}
                </div>
                <div className="mt-1 text-xs font-mono text-slate-600 truncate">
                  {dnsResult.mxRecords[0]
                    ? `${dnsResult.mxRecords[0].priority} ${dnsResult.mxRecords[0].exchange}`
                    : 'No MX exchange'}
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs font-medium text-slate-500">SPF TXT Record</div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    dnsResult.spfRecord ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {dnsResult.spfRecord ? 'Resolved' : 'Missing'}
                </div>
                <div className="mt-1 text-xs font-mono text-slate-600 truncate">
                  {dnsResult.spfRecord || 'No v=spf1 record'}
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs font-medium text-slate-500">
                  DKIM ({dnsResult.selector})
                </div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    dnsResult.dkimRecord ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {dnsResult.dkimRecord ? 'Resolved' : 'Missing'}
                </div>
                <div className="mt-1 text-xs font-mono text-slate-600 truncate">
                  {dnsResult.dkimRecord || `No TXT at ${dnsResult.selector}._domainkey`}
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-md">
                <div className="text-xs font-medium text-slate-500">DMARC Policy</div>
                <div
                  className={`mt-1 text-sm font-semibold ${
                    dnsResult.dmarcRecord ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {dnsResult.dmarcRecord ? 'Resolved' : 'Missing'}
                </div>
                <div className="mt-1 text-xs font-mono text-slate-600 truncate">
                  {dnsResult.dmarcRecord || 'No _dmarc TXT record'}
                </div>
              </div>
            </div>

            {dnsResult.mxRecords.length > 0 && (
              <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50">
                <div className="text-xs font-semibold text-slate-800 mb-2">
                  Resolved MX & Host Records for {dnsResult.domain}
                </div>
                <div className="space-y-1 text-xs font-mono text-slate-700">
                  {dnsResult.mxRecords.map((m, idx) => (
                    <div key={`${m.exchange}-${idx}`}>
                      MX {m.priority} {m.exchange}
                    </div>
                  ))}
                  {dnsResult.aRecords.length > 0 && (
                    <div>A Record: {dnsResult.aRecords.join(', ')}</div>
                  )}
                  {dnsResult.ptrRecords.length > 0 && (
                    <div>PTR Reverse: {dnsResult.ptrRecords.join(', ')}</div>
                  )}
                  {dnsResult.spfRecord && <div>SPF: {dnsResult.spfRecord}</div>}
                  {dnsResult.dmarcRecord && <div>DMARC: {dnsResult.dmarcRecord}</div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-xs text-slate-500">
            Click <span className="font-medium text-slate-700">Verify Live DNS</span> to inspect real MX, SPF, DKIM, and DMARC records via DNS resolution.
          </div>
        )}
      </section>

      {/* OpenDKIM Server Config */}
      <CodeBlock
        title="/etc/opendkim.conf & KeyTable / SigningTable"
        subtitle="Milter binding on 127.0.0.1:8891 for automatic Postfix outbound RSA-SHA256 signing"
        code={generateOpenDkimConfig(previewConfig)}
        filename="opendkim.conf"
      />
    </div>
  );
}
