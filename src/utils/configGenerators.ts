import type { DeploymentStep, DomainConfig, MailboxAccount } from '../types/mail.ts';

export function buildSpfValue(config: DomainConfig): string {
  const parts = ['v=spf1', 'mx', `ip4:${config.serverIp}`];
  if (config.spfInclude.trim()) {
    const includes = config.spfInclude
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    for (const inc of includes) {
      parts.push(inc.startsWith('include:') ? inc : `include:${inc}`);
    }
  }
  parts.push(config.spfPolicy);
  return parts.join(' ');
}

export function buildDkimDnsValue(config: DomainConfig): string {
  const cleanKey = config.dkimPublicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  return `v=DKIM1; h=sha256; k=rsa; p=${cleanKey}`;
}

export function buildDmarcValue(config: DomainConfig): string {
  const rua = config.dmarcRua.trim() || `postmaster@${config.domain}`;
  return `v=DMARC1; p=${config.dmarcPolicy}; sp=${config.dmarcPolicy}; adkim=s; aspf=s; pct=100; rua=mailto:${rua}`;
}

export interface DnsRecordSpec {
  id: string;
  type: 'A' | 'PTR' | 'MX' | 'TXT';
  host: string;
  fqdn: string;
  value: string;
  ttl: number;
  purpose: string;
}

export function generateDnsRecords(config: DomainConfig): DnsRecordSpec[] {
  const mailSub = config.mailHostname.endsWith(`.${config.domain}`)
    ? config.mailHostname.replace(`.${config.domain}`, '')
    : config.mailHostname;

  return [
    {
      id: 'dns-a',
      type: 'A',
      host: mailSub,
      fqdn: config.mailHostname,
      value: config.serverIp,
      ttl: 300,
      purpose: 'Points mail server hostname to private server IPv4 address.',
    },
    {
      id: 'dns-mx',
      type: 'MX',
      host: '@',
      fqdn: config.domain,
      value: `10 ${config.mailHostname}.`,
      ttl: 300,
      purpose: 'Routes inbound SMTP email for your domain to Postfix.',
    },
    {
      id: 'dns-spf',
      type: 'TXT',
      host: '@',
      fqdn: config.domain,
      value: buildSpfValue(config),
      ttl: 300,
      purpose: 'Authorizes your mail server IP and MX host to send mail for this domain.',
    },
    {
      id: 'dns-dkim',
      type: 'TXT',
      host: `${config.dkimSelector}._domainkey`,
      fqdn: `${config.dkimSelector}._domainkey.${config.domain}`,
      value: buildDkimDnsValue(config),
      ttl: 300,
      purpose: 'Publishes the RSA-2048 public key used by receivers to verify DKIM signatures.',
    },
    {
      id: 'dns-dmarc',
      type: 'TXT',
      host: '_dmarc',
      fqdn: `_dmarc.${config.domain}`,
      value: buildDmarcValue(config),
      ttl: 300,
      purpose: 'Enforces strict SPF/DKIM alignment and aggregate reporting.',
    },
    {
      id: 'dns-ptr',
      type: 'PTR',
      host: config.serverIp,
      fqdn: `${config.serverIp.split('.').reverse().join('.')}.in-addr.arpa`,
      value: config.mailHostname,
      ttl: 3600,
      purpose: 'Reverse DNS configured at your VPS provider matching SMTP HELO banner.',
    },
  ];
}

export function generateCloudflareZoneFile(config: DomainConfig): string {
  const mailSub = config.mailHostname.endsWith(`.${config.domain}`)
    ? config.mailHostname.replace(`.${config.domain}`, '')
    : config.mailHostname;

  return `; Cloudflare BIND Zone Import for ${config.domain}
; Important: Ensure "${mailSub}" A record Proxy Status is DNS Only (Grey Cloud)
; Remove existing route1/route2/route3.mx.cloudflare.net MX records before importing

$ORIGIN ${config.domain}.
${mailSub}  300  IN  A    ${config.serverIp}
@           300  IN  MX   10 ${config.mailHostname}.
@           300  IN  TXT  "${buildSpfValue(config)}"
${config.dkimSelector}._domainkey  300  IN  TXT  "${buildDkimDnsValue(config)}"
_dmarc      300  IN  TXT  "${buildDmarcValue(config)}"
`;
}

export function generatePostfixMainCf(config: DomainConfig): string {
  const certPath =
    config.tlsMode === 'letsencrypt'
      ? `/etc/letsencrypt/live/${config.mailHostname}/fullchain.pem`
      : config.tlsMode === 'custom_pem'
        ? `/etc/ssl/certs/${config.mailHostname}.pem`
        : `/etc/ssl/certs/ssl-cert-snakeoil.pem`;

  const keyPath =
    config.tlsMode === 'letsencrypt'
      ? `/etc/letsencrypt/live/${config.mailHostname}/privkey.pem`
      : config.tlsMode === 'custom_pem'
        ? `/etc/ssl/private/${config.mailHostname}.key`
        : `/etc/ssl/private/ssl-cert-snakeoil.key`;

  return `# /etc/postfix/main.cf — Managed by PostForge
# Domain: ${config.domain} | Hostname: ${config.mailHostname}

smtpd_banner = $myhostname ESMTP Postfix
biff = no
append_dot_mydomain = no
readme_directory = no
compatibility_level = 3.6

# Host & Domain Identity
myhostname = ${config.mailHostname}
mydomain = ${config.domain}
myorigin = $mydomain
mydestination = localhost
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
inet_interfaces = all
inet_protocols = ipv4

# Virtual Mailboxes (Dovecot LMTP delivery)
virtual_transport = lmtp:unix:private/dovecot-lmtp
virtual_mailbox_domains = ${config.domain}
virtual_mailbox_maps = hash:/etc/postfix/vmailbox
virtual_alias_maps = hash:/etc/postfix/virtual

# TLS Encryption (Inbound & Outbound)
smtpd_tls_cert_file = ${certPath}
smtpd_tls_key_file = ${keyPath}
smtpd_tls_security_level = may
smtpd_tls_auth_only = yes
smtpd_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_mandatory_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtpd_tls_ciphers = high
smtpd_tls_loglevel = 1
smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache

smtp_tls_security_level = may
smtp_tls_protocols = !SSLv2, !SSLv3, !TLSv1, !TLSv1.1
smtp_tls_ciphers = high
smtp_tls_loglevel = 1
smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache

# SASL Authentication via Dovecot
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_auth_enable = yes
smtpd_sasl_security_options = noanonymous, noplaintext
smtpd_sasl_tls_security_options = noanonymous

# Anti-Relay & Anti-Spoofing Restrictions
smtpd_helo_required = yes
smtpd_recipient_restrictions =
    permit_mynetworks,
    permit_sasl_authenticated,
    reject_unauth_destination,
    reject_invalid_hostname,
    reject_non_fqdn_sender,
    reject_unknown_sender_domain

# OpenDKIM Milter Integration
milter_protocol = 6
milter_default_action = accept
smtpd_milters = inet:127.0.0.1:8891
non_smtpd_milters = inet:127.0.0.1:8891

# Message Size & Queue Limits
message_size_limit = 26214400
mailbox_size_limit = 0
`;
}

export function generatePostfixMasterCf(config: DomainConfig): string {
  const submissionBlock = config.enableSubmission587
    ? `submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_tls_auth_only=yes
  -o smtpd_reject_unlisted_recipient=no
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
`
    : `# submission (587) disabled in configuration\n`;

  const smtpsBlock = config.enableSmtps465
    ? `smtps     inet  n       -       y       -       -       smtpd
  -o syslog_name=postfix/smtps
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
  -o smtpd_recipient_restrictions=permit_sasl_authenticated,reject
  -o milter_macro_daemon_name=ORIGINATING
`
    : `# smtps (465) disabled in configuration\n`;

  return `# /etc/postfix/master.cf — Postfix Service Matrix
smtp      inet  n       -       y       -       -       smtpd
${submissionBlock}${smtpsBlock}pickup    unix  n       -       y       60      1       pickup
cleanup   unix  n       -       y       -       0       cleanup
qmgr      unix  n       -       n       300     1       qmgr
tlsmgr    unix  n       -       y       1000?   1       tlsmgr
rewrite   unix  -       -       y       -       -       trivial-rewrite
bounce    unix  -       -       y       -       0       bounce
defer     unix  -       -       y       -       0       bounce
flush     unix  n       -       y       1000?   0       flush
smtp      unix  -       -       y       -       -       smtp
relay     unix  -       -       y       -       -       smtp
lmtp      unix  -       -       y       -       -       lmtp
`;
}

export function generateDovecotConf(config: DomainConfig, mailboxes: MailboxAccount[]): string {
  const certPath =
    config.tlsMode === 'letsencrypt'
      ? `/etc/letsencrypt/live/${config.mailHostname}/fullchain.pem`
      : `/etc/ssl/certs/${config.mailHostname}.pem`;

  const keyPath =
    config.tlsMode === 'letsencrypt'
      ? `/etc/letsencrypt/live/${config.mailHostname}/privkey.pem`
      : `/etc/ssl/private/${config.mailHostname}.key`;

  const mailboxLines = mailboxes
    .filter((m) => m.enabled)
    .map((m) => `${m.localPart}@${config.domain}  ${config.domain}/${m.localPart}/`)
    .join('\n');

  return `# /etc/dovecot/conf.d/99-postforge.conf
# IMAP & LMTP Maildir Server for ${config.domain}

protocols = imap lmtp

# Maildir Storage Layout
mail_location = maildir:/var/mail/vhosts/%d/%n/Maildir
mail_privileged_group = mail

# TLS Encryption Enforcement
ssl = required
ssl_cert = <${certPath}
ssl_key = <${keyPath}
ssl_min_protocol = TLSv1.2
ssl_prefer_server_ciphers = yes
ssl_cipher_list = ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384

# Authentication (Disable Plaintext Without TLS)
disable_plaintext_auth = yes
auth_mechanisms = plain login

passdb {
  driver = passwd-file
  args = scheme=SHA512-CRYPT username_format=%u /etc/dovecot/users
}

userdb {
  driver = static
  args = uid=vmail gid=vmail home=/var/mail/vhosts/%d/%n
}

# IMAP Listener (${config.enableImaps993 ? '993 IMAPS enabled' : '143 STARTTLS'})
service imap-login {
  inet_listener imap {
    port = 143
  }
  inet_listener imaps {
    port = ${config.enableImaps993 ? '993' : '0'}
    ssl = yes
  }
}

# LMTP Socket for Postfix Inbound Delivery
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

# SASL Auth Socket for Postfix Outbound Submission
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
  user = dovecot
}

# Active Virtual Mailbox Map (/etc/postfix/vmailbox)
${mailboxLines
  .split('\n')
  .map((l) => `# ${l}`)
  .join('\n')}
`;
}

export function generateOpenDkimConfig(config: DomainConfig): string {
  return `# /etc/opendkim.conf
Syslog                  yes
SyslogSuccess           yes
LogWhy                  yes
UMask                   007
Mode                    sv
Canonicalization        relaxed/simple
AutoRestart             yes
AutoRestartRate         10/1h
SignatureAlgorithm      rsa-sha256
Socket                  inet:8891@localhost
PidFile                 /run/opendkim/opendkim.pid
UserID                  opendkim

KeyTable                refile:/etc/opendkim/KeyTable
SigningTable            refile:/etc/opendkim/SigningTable
ExternalIgnoreList      /etc/opendkim/TrustedHosts
InternalHosts           /etc/opendkim/TrustedHosts

# --- /etc/opendkim/KeyTable ---
# ${config.dkimSelector}._domainkey.${config.domain} ${config.domain}:${config.dkimSelector}:/etc/opendkim/keys/${config.domain}/${config.dkimSelector}.private

# --- /etc/opendkim/SigningTable ---
# *@${config.domain} ${config.dkimSelector}._domainkey.${config.domain}

# --- /etc/opendkim/TrustedHosts ---
# 127.0.0.1
# localhost
# ${config.serverIp}
# *.${config.domain}
`;
}

export function generateFirewallAndFail2ban(config: DomainConfig): string {
  const sshLine = config.allowedSshCidr.trim()
    ? `ufw allow from ${config.allowedSshCidr.trim()} to any port ${config.sshPort} proto tcp comment 'Restricted SSH'`
    : `ufw allow ${config.sshPort}/tcp comment 'SSH Admin'`;

  return `#!/usr/bin/env bash
# UFW Firewall & Fail2ban Hardening Script for ${config.mailHostname}
set -euo pipefail

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Administrative & TLS Certificate Ports
${sshLine}
ufw allow 80/tcp comment 'ACME HTTP-01 Certbot Challenge'
ufw allow 443/tcp comment 'HTTPS Webmail & MTA-STS'

# Mail Transport & Retrieval Ports
ufw allow 25/tcp comment 'Postfix Inbound SMTP'
${config.enableSubmission587 ? "ufw allow 587/tcp comment 'Postfix SMTP Submission (STARTTLS)'" : "# 587/tcp disabled"}
${config.enableSmtps465 ? "ufw allow 465/tcp comment 'Postfix SMTPS (Implicit TLS)'" : "# 465/tcp disabled"}
ufw allow 143/tcp comment 'Dovecot IMAP (STARTTLS)'
${config.enableImaps993 ? "ufw allow 993/tcp comment 'Dovecot IMAPS (Implicit TLS)'" : "# 993/tcp disabled"}

ufw --force enable
ufw status verbose

# --- /etc/fail2ban/jail.local ---
cat <<'EOF' > /etc/fail2ban/jail.local
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ${config.sshPort}

[postfix]
enabled = true
port = smtp,465,submission
logpath = /var/log/mail.log

[postfix-sasl]
enabled = ${config.enableFail2ban ? 'true' : 'false'}
port = smtp,465,submission,imap,imaps
logpath = /var/log/mail.log
maxretry = 3
bantime = 4h

[dovecot]
enabled = ${config.enableFail2ban ? 'true' : 'false'}
port = imap,imaps
logpath = /var/log/mail.log
maxretry = 5
EOF

systemctl enable fail2ban
systemctl restart fail2ban
`;
}

export function generateMonitoringConfig(config: DomainConfig): string {
  return `# Mail Server Log & Telemetry Monitoring Stack (${config.mailHostname})
# Combines Rsyslog /var/log/mail.log, Postfix Queue Exporter, Fail2ban Exporter & Promtail

# 1. Install Monitoring Packages on Ubuntu/Debian:
# apt-get update && apt-get install -y logwatch prometheus-node-exporter fail2ban

# 2. /etc/promtail/config.yml (Ship Mail Logs to Loki / Monitoring Console)
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://127.0.0.1:3100/loki/api/v1/push

scrape_configs:
  - job_name: mail_system_logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: mailserver
          host: ${config.mailHostname}
          domain: ${config.domain}
          __path__: /var/log/mail.log

  - job_name: fail2ban_logs
    static_configs:
      - targets:
          - localhost
        labels:
          job: fail2ban
          host: ${config.mailHostname}
          __path__: /var/log/fail2ban.log

# 3. Daily Logwatch Digest Command:
# logwatch --service postfix --service dovecot --range yesterday --detail Med --mailto postmaster@${config.domain}
`;
}

export function generateDeployPipelineYaml(config: DomainConfig): string {
  return `# .github/workflows/deploy-mailserver.yml
# Automated Deployment Pipeline for ${config.mailHostname} (${config.domain})

name: Deploy Private Mail Server

on:
  push:
    branches: [ main ]
    paths:
      - 'infra/**'
      - 'README.md'
  workflow_dispatch:

jobs:
  validate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Infrastructure Repo
        uses: actions/checkout@v4

      - name: Validate DNS & SPF/DMARC Syntax
        run: |
          echo "Checking target domain: ${config.domain}"
          dig +short MX ${config.domain}
          dig +short TXT ${config.domain}
          dig +short TXT _dmarc.${config.domain}
          dig +short TXT ${config.dkimSelector}._domainkey.${config.domain}

      - name: Deploy Configs via SSH & Reload Services
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${config.serverIp}
          username: root
          port: ${config.sshPort}
          key: \${{ secrets.MAIL_SERVER_SSH_KEY }}
          script: |
            set -e
            postfix check
            doveconf -n > /dev/null
            opendkim-testkey -d ${config.domain} -s ${config.dkimSelector} -vvv || true
            systemctl reload postfix dovecot opendkim
            ufw status numbered
            fail2ban-client status postfix-sasl
`;
}

export function generateProvisionScript(config: DomainConfig, mailboxes: MailboxAccount[]): string {
  const userLoop = mailboxes
    .filter((m) => m.enabled)
    .map(
      (m) =>
        `echo "${m.localPart}@${config.domain}  ${config.domain}/${m.localPart}/" >> /etc/postfix/vmailbox\nmkdir -p /var/mail/vhosts/${config.domain}/${m.localPart}/Maildir`
    )
    .join('\n');

  return `#!/usr/bin/env bash
# Complete Private Mail Server Provisioner for ${config.domain}
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postfix postfix-pcre dovecot-core dovecot-imapd dovecot-lmtpd opendkim opendkim-tools certbot ufw fail2ban

hostnamectl set-hostname ${config.mailHostname}

# Obtain Let's Encrypt TLS Certificate
${
  config.tlsMode === 'letsencrypt'
    ? `certbot certonly --standalone -d ${config.mailHostname} --non-interactive --agree-tos -m ${config.tlsEmail}`
    : `# Using configured TLS mode: ${config.tlsMode}`
}

# Create virtual mail system user
groupadd -g 5000 vmail || true
useradd -g vmail -u 5000 vmail -d /var/mail/vhosts -m || true

# Provision domain mailboxes
: > /etc/postfix/vmailbox
${userLoop}
postmap /etc/postfix/vmailbox
chown -R vmail:vmail /var/mail/vhosts

# Apply DKIM directory permissions
mkdir -p /etc/opendkim/keys/${config.domain}
chown -R opendkim:opendkim /etc/opendkim
chmod 700 /etc/opendkim/keys/${config.domain}

# Validate and restart services
postfix check
doveconf -n > /dev/null
systemctl restart opendkim dovecot postfix
`;
}

export function generateReadmeMarkdown(
  config: DomainConfig,
  mailboxes: MailboxAccount[],
  steps: DeploymentStep[]
): string {
  const dnsRecords = generateDnsRecords(config);
  const completedCount = steps.filter((s) => s.status === 'completed').length;

  const dnsTableRows = dnsRecords
    .map((r) => `| \`${r.type}\` | \`${r.host}\` | \`${r.value}\` | ${r.ttl}s | ${r.purpose} |`)
    .join('\n');

  const mailboxRows = mailboxes
    .map(
      (m) =>
        `| \`${m.localPart}@${config.domain}\` | ${m.displayName} | ${m.role} | ${m.quotaMb} MB | ${m.enabled ? 'Active' : 'Disabled'} |`
    )
    .join('\n');

  const stepRows = steps
    .map(
      (s) =>
        `- [${s.status === 'completed' ? 'x' : ' '}] **${s.order}. ${s.title}** (${s.phase}) — \`${s.status.toUpperCase()}\`\n  - ${s.description}\n  - Verify: \`${s.verificationCmd}\``
    )
    .join('\n');

  return `# ${config.domain} — Private Domain Email Platform (PostForge)

> **Living Documentation** · Automatically updated on every infrastructure, security, DNS, mailbox, or deployment pipeline change.
> Last synchronized: \`${new Date().toISOString()}\`

## Architecture Overview

This repository configures and manages a self-hosted private email server for **\`${config.domain}\`** running on **\`${config.mailHostname}\`** (\`${config.serverIp}\`).

| Component | Role | Security & Protocol Configuration |
| :--- | :--- | :--- |
| **Postfix** | MTA / SMTP Server | Port \`25\` (Inbound), \`587\` Submission (${config.enableSubmission587 ? 'Enabled · STARTTLS' : 'Disabled'}), \`465\` SMTPS (${config.enableSmtps465 ? 'Enabled · Implicit TLS' : 'Disabled'}) |
| **Dovecot** | MDA / IMAP Server | Port \`993\` IMAPS (${config.enableImaps993 ? 'Enabled · TLSv1.2+' : 'Disabled'}), Maildir storage, SASL Auth socket |
| **OpenDKIM** | Outbound Signing | RSA-2048 SHA-256 signing · Selector: \`${config.dkimSelector}\` |
| **SPF & DMARC** | Anti-Spoofing | SPF: \`${config.spfPolicy}\` · DMARC: \`p=${config.dmarcPolicy}\` |
| **TLS Encryption** | Transport Security | Mode: \`${config.tlsMode}\` · Contact: \`${config.tlsEmail}\` |
| **UFW & Fail2ban** | Perimeter Defense | Firewall: \`${config.enableFirewall ? 'Enforced' : 'Pending'}\` · Fail2ban: \`${config.enableFail2ban ? 'Active' : 'Pending'}\` · SSH Port: \`${config.sshPort}\` |
| **Log Monitoring** | Observability | Status: \`${config.enableMonitoring ? 'Promtail + Logwatch Active' : 'Disabled'}\` (\`/var/log/mail.log\`) |

---

## Domain Mailboxes (${mailboxes.length})

| Address | Display Name | Role | Quota | Status |
| :--- | :--- | :--- | :--- | :--- |
${mailboxRows}

---

## Required DNS Records (${config.domain})

Configure these records at your DNS registrar and verify propagation from the **DNS, DKIM & SPF** console:

| Type | Host / Name | Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
${dnsTableRows}

---

## Security Hardening Summary

1. **SMTP & IMAP Encryption**: Plaintext authentication is disabled (\`disable_plaintext_auth = yes\`, \`smtpd_tls_auth_only = yes\`). Minimum TLS version enforced at \`TLSv1.2\`.
2. **Deliverability Authentication**: Every outbound email is signed with a 2048-bit RSA DKIM signature (\`${config.dkimSelector}._domainkey.${config.domain}\`) and aligned with SPF (\`${buildSpfValue(config)}\`) and DMARC (\`p=${config.dmarcPolicy}\`).
3. **Firewall Rules (UFW)**: Default deny incoming policy; only ports \`${config.sshPort}\` (SSH${config.allowedSshCidr ? ` from ${config.allowedSshCidr}` : ''}), \`25\`, ${config.enableSubmission587 ? '`587`, ' : ''}${config.enableSmtps465 ? '`465`, ' : ''}\`143\`, ${config.enableImaps993 ? '`993`, ' : ''}\`80\`, and \`443\` are open.
4. **Intrusion Prevention & Monitoring**: Fail2ban jails monitor \`postfix-sasl\` and \`dovecot\` logs in \`/var/log/mail.log\`.

---

## Deployment Pipeline Progress (${completedCount}/${steps.length} Complete)

${stepRows}

---

## API & Workbench Capabilities

- \`GET /api/state\` — Retrieve platform config, mailboxes, messages, mail logs, and live README.
- \`PUT /api/config\` — Persist server & security settings and regenerate \`README.md\`.
- \`POST /api/dkim/generate\` — Generate a real 2048-bit RSA DKIM keypair via Node \`crypto\`.
- \`POST /api/dns/verify\` — Run live DNS lookups (\`MX\`, \`TXT\`, \`SPF\`, \`DKIM\`, \`DMARC\`, \`A\`, \`PTR\`).
- \`POST /api/network/probe\` — Probe live TCP/TLS connectivity on ports \`25\`, \`587\`, \`465\`, \`143\`, \`993\`.
- \`POST /api/messages/send\` — Dispatch DKIM-signed domain mail with full SMTP envelope trace.
- \`GET /api/bundle\` — Export all Postfix, Dovecot, OpenDKIM, UFW, Monitoring, and CI/CD configs.
`;
}
