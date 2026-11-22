# mailstack.example.com — Private Domain Email Platform (PostForge)

> **Living Documentation** · Automatically updated on every infrastructure, security, DNS, mailbox, or deployment pipeline change.
> Last synchronized: `2026-11-14T11:44:46.929Z`

## Architecture Overview

This repository configures and manages a self-hosted private email server for **`mailstack.example.com`** running on **`mail.mailstack.example.com`** (`203.0.113.42`).

| Component | Role | Security & Protocol Configuration |
| :--- | :--- | :--- |
| **Postfix** | MTA / SMTP Server | Port `25` (Inbound), `587` Submission (Enabled · STARTTLS), `465` SMTPS (Enabled · Implicit TLS) |
| **Dovecot** | MDA / IMAP Server | Port `993` IMAPS (Enabled · TLSv1.2+), Maildir storage, SASL Auth socket |
| **OpenDKIM** | Outbound Signing | RSA-2048 SHA-256 signing · Selector: `mail2026` |
| **SPF & DMARC** | Anti-Spoofing | SPF: `-all` · DMARC: `p=quarantine` |
| **TLS Encryption** | Transport Security | Mode: `letsencrypt` · Contact: `admin@mailstack.example.com` |
| **UFW & Fail2ban** | Perimeter Defense | Firewall: `Enforced` · Fail2ban: `Active` · SSH Port: `22` |
| **Log Monitoring** | Observability | Status: `Promtail + Logwatch Active` (`/var/log/mail.log`) |

---

## Domain Mailboxes (3)

| Address | Display Name | Role | Quota | Status |
| :--- | :--- | :--- | :--- | :--- |
| `admin@mailstack.example.com` | Domain Administrator | Primary Operations | 10240 MB | Active |
| `postmaster@mailstack.example.com` | Postmaster & DMARC Reports | RFC 5321 Compliance | 5120 MB | Active |
| `support@mailstack.example.com` | Customer Support Desk | Inbound Queue | 20480 MB | Active |

---

## Required DNS Records (mailstack.example.com)

Configure these records at your DNS registrar and verify propagation from the **DNS, DKIM & SPF** console:

| Type | Host / Name | Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `A` | `mail` | `203.0.113.42` | 300s | Points mail server hostname to private server IPv4 address. |
| `MX` | `@` | `10 mail.mailstack.example.com.` | 300s | Routes inbound SMTP email for your domain to Postfix. |
| `TXT` | `@` | `v=spf1 mx ip4:203.0.113.42 -all` | 300s | Authorizes your mail server IP and MX host to send mail for this domain. |
| `TXT` | `mail2026._domainkey` | `v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvNYILT+FD2fTdsftBe2gNWIx0flGT1+LRHMEOsC19TdTNChTougGpkGZZiq03RHCTnmDH0jSt84FTvsut7Xq++jk5f0X6IEv7YqP0c71UkAxvSSrlQTImnJOW3ofpz2kj9gECQ4UuQRWb7KocZqDKJTYDpKSibzl/4G06OL2IbEzL49M6tbGJPFhNxu4t5gcKl6l8jC0OwN0L3lmfDe/BpwJgxWxVJET0jdBCCEH2hqUkzcYAQvIBbmfeIWfKTbE8FsED/YLCxmJrFbrlC55U97Bf0d3+4wuf2s25VvTpSLP6DkFGiEYec3JVMN326PC7RHWeYGZnUL0UoLx3K4PcQIDAQAB` | 300s | Publishes the RSA-2048 public key used by receivers to verify DKIM signatures. |
| `TXT` | `_dmarc` | `v=DMARC1; p=quarantine; sp=quarantine; adkim=s; aspf=s; pct=100; rua=mailto:postmaster@mailstack.example.com` | 300s | Enforces strict SPF/DKIM alignment and aggregate reporting. |
| `PTR` | `203.0.113.42` | `mail.mailstack.example.com` | 3600s | Reverse DNS configured at your VPS provider matching SMTP HELO banner. |

---

## Security Hardening Summary

1. **SMTP & IMAP Encryption**: Plaintext authentication is disabled (`disable_plaintext_auth = yes`, `smtpd_tls_auth_only = yes`). Minimum TLS version enforced at `TLSv1.2`.
2. **Deliverability Authentication**: Every outbound email is signed with a 2048-bit RSA DKIM signature (`mail2026._domainkey.mailstack.example.com`) and aligned with SPF (`v=spf1 mx ip4:203.0.113.42 -all`) and DMARC (`p=quarantine`).
3. **Firewall Rules (UFW)**: Default deny incoming policy; only ports `22` (SSH from 0.0.0.0/0), `25`, `587`, `465`, `143`, `993`, `80`, and `443` are open.
4. **Intrusion Prevention & Monitoring**: Fail2ban jails monitor `postfix-sasl` and `dovecot` logs in `/var/log/mail.log`.

---

## Deployment Pipeline Progress (2/7 Complete)

- [x] **1. Private Server & Hostname Setup** (Infrastructure) — `COMPLETED`
  - Configure FQDN hostname, static IPv4/PTR reverse DNS, and base system updates.
  - Verify: `hostnamectl status && dig -x 203.0.113.42 +short`
- [x] **2. Postfix SMTP & Dovecot IMAP Installation** (Mail Protocols) — `COMPLETED`
  - Install Postfix MTA, Dovecot IMAP/LMTP, and configure SASL + Maildir virtual mailboxes.
  - Verify: `postfix check && doveconf -n | head -n 20`
- [ ] **3. TLS Certificate & Cipher Hardening** (Encryption) — `IN_PROGRESS`
  - Issue Let’s Encrypt certificate via Certbot and enforce TLS 1.2/1.3 across SMTP/IMAP.
  - Verify: `openssl s_client -connect mail.mailstack.example.com:993 -tls1_2 </dev/null`
- [ ] **4. DKIM, SPF & DMARC DNS Configuration** (Deliverability) — `IN_PROGRESS`
  - Publish MX, SPF, 2048-bit RSA DKIM, and DMARC TXT records to prevent spam placement.
  - Verify: `opendkim-testkey -d mailstack.example.com -s mail2026 -vvv`
- [ ] **5. UFW Firewall & Fail2ban Jails** (Security) — `PENDING`
  - Block unauthorized ports and enable automatic IP banning for brute-force auth attempts.
  - Verify: `ufw status verbose && fail2ban-client status postfix-sasl`
- [ ] **6. Mail Log Monitoring & Alerting** (Observability) — `PENDING`
  - Deploy Promtail log scraping on /var/log/mail.log and daily Logwatch digest reports.
  - Verify: `tail -n 30 /var/log/mail.log && systemctl status promtail`
- [ ] **7. CI/CD Pipeline & Living Documentation** (Deployment) — `PENDING`
  - Automate config validation, SSH reload, and README.md synchronization on every change.
  - Verify: `gh workflow run deploy-mailserver.yml`

---

## API & Workbench Capabilities

- `GET /api/state` — Retrieve platform config, mailboxes, messages, mail logs, and live README.
- `PUT /api/config` — Persist server & security settings and regenerate `README.md`.
- `POST /api/dkim/generate` — Generate a real 2048-bit RSA DKIM keypair via Node `crypto`.
- `POST /api/dns/verify` — Run live DNS lookups (`MX`, `TXT`, `SPF`, `DKIM`, `DMARC`, `A`, `PTR`).
- `POST /api/network/probe` — Probe live TCP/TLS connectivity on ports `25`, `587`, `465`, `143`, `993`.
- `POST /api/messages/send` — Dispatch DKIM-signed domain mail with full SMTP envelope trace.
- `GET /api/bundle` — Export all Postfix, Dovecot, OpenDKIM, UFW, Monitoring, and CI/CD configs.
