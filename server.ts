import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  DeploymentStep,
  DnsCheckResult,
  DomainConfig,
  EmailMessage,
  MailboxAccount,
  MailLogEntry,
  PlatformState,
  PortProbeResult,
  StepStatus,
} from './src/types/mail.ts';
import {
  buildDkimDnsValue,
  buildDmarcValue,
  buildSpfValue,
  generateDeployPipelineYaml,
  generateDovecotConf,
  generateFirewallAndFail2ban,
  generateMonitoringConfig,
  generateOpenDkimConfig,
  generatePostfixMainCf,
  generatePostfixMasterCf,
  generateProvisionScript,
  generateReadmeMarkdown,
} from './src/utils/configGenerators.ts';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'mailplatform.json');
const README_FILE = path.join(process.cwd(), 'README.md');

function generateRsaDkimPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function signDkimHeader(
  privateKeyPem: string,
  domain: string,
  selector: string,
  from: string,
  to: string,
  subject: string,
  body: string
): string {
  const bodyHash = crypto
    .createHash('sha256')
    .update(body.replace(/\r?\n/g, '\r\n') + '\r\n')
    .digest('base64');

  const timestamp = Math.floor(Date.now() / 1000);
  const unsignedHeader = [
    `v=1; a=rsa-sha256; c=relaxed/simple; d=${domain}; s=${selector};`,
    `t=${timestamp}; bh=${bodyHash};`,
    `h=from:to:subject:date; b=`,
  ].join(' ');

  const canonicalHeaders = [
    `from:${from.trim()}`,
    `to:${to.trim()}`,
    `subject:${subject.trim()}`,
    `date:${new Date().toUTCString()}`,
    `dkim-signature:${unsignedHeader}`,
  ].join('\r\n');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonicalHeaders);
  const signature = signer.sign(privateKeyPem, 'base64');

  return `${unsignedHeader}${signature}`;
}

function formatQueueId(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function createInitialState(): PlatformState {
  const now = new Date().toISOString();
  const domain = 'carspace.org.in';
  const mailHostname = `mail.${domain}`;
  const { publicKey, privateKey } = generateRsaDkimPair();

  const config: DomainConfig = {
    domain,
    mailHostname,
    serverIp: '203.0.113.42',
    dkimSelector: 'mail2026',
    dkimPublicKey: publicKey,
    dkimPrivateKey: privateKey,
    dkimCreatedAt: now,
    spfPolicy: '-all',
    spfInclude: '',
    dmarcPolicy: 'quarantine',
    dmarcRua: `postmaster@${domain}`,
    tlsMode: 'letsencrypt',
    tlsEmail: `admin@${domain}`,
    enableSubmission587: true,
    enableSmtps465: true,
    enableImaps993: true,
    enableFirewall: true,
    sshPort: 22,
    allowedSshCidr: '0.0.0.0/0',
    enableFail2ban: true,
    enableMonitoring: true,
    updatedAt: now,
  };

  const mailboxes: MailboxAccount[] = [
    {
      id: 'mbx-admin',
      localPart: 'admin',
      domain,
      displayName: 'Domain Administrator',
      role: 'Primary Operations',
      quotaMb: 10240,
      usedMb: 142,
      enabled: true,
      createdAt: now,
    },
    {
      id: 'mbx-postmaster',
      localPart: 'postmaster',
      domain,
      displayName: 'Postmaster & DMARC Reports',
      role: 'RFC 5321 Compliance',
      quotaMb: 5120,
      usedMb: 38,
      enabled: true,
      createdAt: now,
    },
    {
      id: 'mbx-support',
      localPart: 'support',
      domain,
      displayName: 'Customer Support Desk',
      role: 'Inbound Queue',
      quotaMb: 20480,
      usedMb: 410,
      enabled: true,
      createdAt: now,
    },
  ];

  const welcomeBody = [
    `Hello Administrator,`,
    ``,
    `Your private mail server for ${domain} has been initialized with Postfix (SMTP) and Dovecot (IMAP/LMTP).`,
    ``,
    `Security posture active in this configuration:`,
    `- Outbound SMTP Submission enforced on port 587 (STARTTLS) & 465 (SMTPS)`,
    `- Inbound IMAP retrieval encrypted on port 993 (TLSv1.2+)`,
    `- 2048-bit RSA DKIM signing enabled with selector "${config.dkimSelector}"`,
    `- SPF (${config.spfPolicy}) and DMARC (p=${config.dmarcPolicy}) policies configured`,
    `- UFW perimeter firewall & Fail2ban SASL protection active`,
    ``,
    `Use the DNS, DKIM & SPF console to run live DNS verification against your public domain.`,
  ].join('\n');

  const welcomeDkim = signDkimHeader(
    privateKey,
    domain,
    config.dkimSelector,
    `postmaster@${domain}`,
    `admin@${domain}`,
    `Private Mail Server Initialized for ${domain}`,
    welcomeBody
  );

  const messages: EmailMessage[] = [
    {
      id: 'msg-welcome-1',
      folder: 'inbox',
      from: `postmaster@${domain}`,
      to: `admin@${domain}`,
      subject: `Private Mail Server Initialized for ${domain}`,
      body: welcomeBody,
      timestamp: now,
      dkimSigned: true,
      dkimSignatureHeader: welcomeDkim,
      spfStatus: 'pass',
      dmarcStatus: 'pass',
      tlsCipher: 'TLSv1.3 (TLS_AES_256_GCM_SHA384)',
      messageId: `<${crypto.randomUUID()}@${mailHostname}>`,
      sizeBytes: Buffer.byteLength(welcomeBody, 'utf8') + 680,
      read: false,
      rawHeaders: [
        `Return-Path: <postmaster@${domain}>`,
        `Received: from ${mailHostname} (localhost [127.0.0.1]) by ${mailHostname} (Postfix) with ESMTPSA id ${formatQueueId()}; ${new Date(now).toUTCString()}`,
        `Authentication-Results: ${mailHostname}; dkim=pass header.d=${domain} header.s=${config.dkimSelector}; spf=pass smtp.mailfrom=${domain}; dmarc=pass (p=${config.dmarcPolicy})`,
        `DKIM-Signature: ${welcomeDkim}`,
        `From: postmaster@${domain}`,
        `To: admin@${domain}`,
        `Subject: Private Mail Server Initialized for ${domain}`,
      ].join('\n'),
    },
  ];

  const logs: MailLogEntry[] = [
    {
      id: 'log-1',
      timestamp: now,
      service: 'postfix/smtpd',
      severity: 'info',
      queueId: formatQueueId(),
      message: `daemon started -- version 3.8.6, configuration /etc/postfix (${mailHostname})`,
    },
    {
      id: 'log-2',
      timestamp: now,
      service: 'dovecot/imap',
      severity: 'info',
      queueId: 'DOVECOT',
      message: `Dovecot v2.3.21 starting up for imap, lmtp (TLSv1.2+ enforced, disable_plaintext_auth=yes)`,
    },
    {
      id: 'log-3',
      timestamp: now,
      service: 'opendkim',
      severity: 'info',
      queueId: 'DKIM2048',
      message: `OpenDKIM Filter v2.11.0 initialized on inet:127.0.0.1:8891 (selector=${config.dkimSelector})`,
    },
    {
      id: 'log-4',
      timestamp: now,
      service: 'ufw',
      severity: 'info',
      queueId: 'UFW-RULE',
      message: `Perimeter policy active: DENY incoming default | ALLOW 22, 25, 80, 143, 443, 465, 587, 993/tcp`,
    },
    {
      id: 'log-5',
      timestamp: now,
      service: 'fail2ban',
      severity: 'info',
      queueId: 'JAIL-OK',
      message: `Jails armed: sshd, postfix, postfix-sasl (maxretry=3), dovecot (maxretry=5)`,
    },
  ];

  const deploymentSteps: DeploymentStep[] = [
    {
      id: 'step-host',
      order: 1,
      phase: 'Infrastructure',
      title: 'Private Server & Hostname Setup',
      description: 'Configure FQDN hostname, static IPv4/PTR reverse DNS, and base system updates.',
      status: 'completed',
      verificationCmd: `hostnamectl status && dig -x ${config.serverIp} +short`,
      updatedAt: now,
    },
    {
      id: 'step-postfix-dovecot',
      order: 2,
      phase: 'Mail Protocols',
      title: 'Postfix SMTP & Dovecot IMAP Installation',
      description: 'Install Postfix MTA, Dovecot IMAP/LMTP, and configure SASL + Maildir virtual mailboxes.',
      status: 'completed',
      verificationCmd: 'postfix check && doveconf -n | head -n 20',
      updatedAt: now,
    },
    {
      id: 'step-tls',
      order: 3,
      phase: 'Encryption',
      title: 'TLS Certificate & Cipher Hardening',
      description: 'Issue Let’s Encrypt certificate via Certbot and enforce TLS 1.2/1.3 across SMTP/IMAP.',
      status: 'in_progress',
      verificationCmd: `openssl s_client -connect ${mailHostname}:993 -tls1_2 </dev/null`,
      updatedAt: now,
    },
    {
      id: 'step-dns-dkim-spf',
      order: 4,
      phase: 'Deliverability',
      title: 'DKIM, SPF & DMARC DNS Configuration',
      description: 'Publish MX, SPF, 2048-bit RSA DKIM, and DMARC TXT records to prevent spam placement.',
      status: 'in_progress',
      verificationCmd: `opendkim-testkey -d ${domain} -s ${config.dkimSelector} -vvv`,
      updatedAt: now,
    },
    {
      id: 'step-firewall',
      order: 5,
      phase: 'Security',
      title: 'UFW Firewall & Fail2ban Jails',
      description: 'Block unauthorized ports and enable automatic IP banning for brute-force auth attempts.',
      status: 'pending',
      verificationCmd: 'ufw status verbose && fail2ban-client status postfix-sasl',
      updatedAt: now,
    },
    {
      id: 'step-monitoring',
      order: 6,
      phase: 'Observability',
      title: 'Mail Log Monitoring & Alerting',
      description: 'Deploy Promtail log scraping on /var/log/mail.log and daily Logwatch digest reports.',
      status: 'pending',
      verificationCmd: 'tail -n 30 /var/log/mail.log && systemctl status promtail',
      updatedAt: now,
    },
    {
      id: 'step-cicd',
      order: 7,
      phase: 'Deployment',
      title: 'CI/CD Pipeline & Living Documentation',
      description: 'Automate config validation, SSH reload, and README.md synchronization on every change.',
      status: 'pending',
      verificationCmd: 'gh workflow run deploy-mailserver.yml',
      updatedAt: now,
    },
  ];

  const readmeMarkdown = generateReadmeMarkdown(config, mailboxes, deploymentSteps);

  return {
    config,
    mailboxes,
    messages,
    logs,
    deploymentSteps,
    readmeMarkdown,
  };
}

let cachedState: PlatformState | null = null;

async function persistState(state: PlatformState): Promise<PlatformState> {
  state.readmeMarkdown = generateReadmeMarkdown(
    state.config,
    state.mailboxes,
    state.deploymentSteps
  );
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  await fs.writeFile(README_FILE, state.readmeMarkdown, 'utf8');
  cachedState = state;
  return state;
}

async function getState(): Promise<PlatformState> {
  if (cachedState) return cachedState;
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PlatformState;
    parsed.readmeMarkdown = generateReadmeMarkdown(
      parsed.config,
      parsed.mailboxes,
      parsed.deploymentSteps
    );
    await fs.writeFile(README_FILE, parsed.readmeMarkdown, 'utf8');
    cachedState = parsed;
    return parsed;
  } catch {
    const initial = createInitialState();
    return persistState(initial);
  }
}

function appendLog(
  state: PlatformState,
  service: MailLogEntry['service'],
  severity: MailLogEntry['severity'],
  queueId: string,
  message: string
): void {
  const entry: MailLogEntry = {
    id: `log-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    service,
    severity,
    queueId,
    message,
  };
  state.logs = [entry, ...state.logs].slice(0, 150);
}

async function probeMailPort(
  host: string,
  port: number,
  service: string,
  protocol: PortProbeResult['protocol']
): Promise<PortProbeResult> {
  const started = Date.now();
  const isImplicitTls = port === 465 || port === 993;

  return new Promise<PortProbeResult>((resolve) => {
    let settled = false;
    const timeoutMs = 3200;

    const finish = (partial: Omit<PortProbeResult, 'port' | 'service' | 'protocol' | 'latencyMs'>) => {
      if (settled) return;
      settled = true;
      resolve({
        port,
        service,
        protocol,
        latencyMs: Date.now() - started,
        ...partial,
      });
    };

    if (isImplicitTls) {
      const socket = tls.connect(
        { host, port, rejectUnauthorized: false, servername: host },
        () => {
          const proto = socket.getProtocol() || 'TLSv1.3';
          socket.once('data', (chunk) => {
            const banner = chunk.toString('utf8').trim().slice(0, 140);
            socket.destroy();
            finish({
              reachable: true,
              tlsSupported: true,
              tlsProtocol: proto,
              banner: banner || 'TLS handshake succeeded',
              error: null,
            });
          });
          setTimeout(() => {
            socket.destroy();
            finish({
              reachable: true,
              tlsSupported: true,
              tlsProtocol: proto,
              banner: 'TLS handshake completed (no banner emitted within wait window)',
              error: null,
            });
          }, 900);
        }
      );
      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => {
        socket.destroy();
        finish({
          reachable: false,
          tlsSupported: false,
          tlsProtocol: null,
          banner: null,
          error: `Connection timed out after ${timeoutMs}ms`,
        });
      });
      socket.on('error', (err) => {
        socket.destroy();
        finish({
          reachable: false,
          tlsSupported: false,
          tlsProtocol: null,
          banner: null,
          error: err.message,
        });
      });
    } else {
      const socket = net.createConnection({ host, port });
      socket.setTimeout(timeoutMs);
      socket.on('connect', () => {
        socket.once('data', (chunk) => {
          const banner = chunk.toString('utf8').trim().slice(0, 140);
          socket.destroy();
          finish({
            reachable: true,
            tlsSupported: banner.toUpperCase().includes('STARTTLS') || port === 587 || port === 143,
            tlsProtocol: port === 587 || port === 143 ? 'STARTTLS Capable' : null,
            banner: banner || 'TCP connected',
            error: null,
          });
        });
        setTimeout(() => {
          socket.destroy();
          finish({
            reachable: true,
            tlsSupported: false,
            tlsProtocol: null,
            banner: 'TCP port open',
            error: null,
          });
        }, 900);
      });
      socket.on('timeout', () => {
        socket.destroy();
        finish({
          reachable: false,
          tlsSupported: false,
          tlsProtocol: null,
          banner: null,
          error: `Connection timed out after ${timeoutMs}ms`,
        });
      });
      socket.on('error', (err) => {
        socket.destroy();
        finish({
          reachable: false,
          tlsSupported: false,
          tlsProtocol: null,
          banner: null,
          error: err.message,
        });
      });
    }
  });
}

async function startServer() {
  await getState();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/state', async (_req, res) => {
    try {
      const state = await getState();
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load state' });
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const state = await getState();
      const patch = req.body as Partial<DomainConfig>;
      const prevDomain = state.config.domain;
      const nextDomain = (patch.domain ?? state.config.domain).trim().toLowerCase();

      state.config = {
        ...state.config,
        ...patch,
        domain: nextDomain || prevDomain,
        updatedAt: new Date().toISOString(),
      };

      if (nextDomain && nextDomain !== prevDomain) {
        state.mailboxes = state.mailboxes.map((mbx) => ({
          ...mbx,
          domain: nextDomain,
        }));
      }

      appendLog(
        state,
        'pipeline',
        'info',
        'CONF-SYNC',
        `Updated configuration for ${state.config.domain} (${state.config.mailHostname}); regenerated Postfix, Dovecot, UFW, and README.md`
      );

      const saved = await persistState(state);
      res.json(saved);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid config payload' });
    }
  });

  app.post('/api/dkim/generate', async (req, res) => {
    try {
      const state = await getState();
      const selector = String(req.body?.selector || state.config.dkimSelector || 'mail2026')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '');

      const { publicKey, privateKey } = generateRsaDkimPair();
      state.config.dkimSelector = selector || 'mail2026';
      state.config.dkimPublicKey = publicKey;
      state.config.dkimPrivateKey = privateKey;
      state.config.dkimCreatedAt = new Date().toISOString();
      state.config.updatedAt = new Date().toISOString();

      appendLog(
        state,
        'opendkim',
        'info',
        'DKIM-GEN',
        `Generated fresh RSA-2048 DKIM keypair for ${state.config.dkimSelector}._domainkey.${state.config.domain}`
      );

      const saved = await persistState(state);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate DKIM keys' });
    }
  });

  app.post('/api/mailboxes', async (req, res) => {
    try {
      const state = await getState();
      const localPart = String(req.body?.localPart || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._+-]/g, '');
      const displayName = String(req.body?.displayName || '').trim() || localPart;
      const role = String(req.body?.role || 'Standard Mailbox').trim();
      const quotaMb = Math.max(256, Math.min(102400, Number(req.body?.quotaMb || 5120)));

      if (!localPart) {
        res.status(400).json({ error: 'Valid local-part address is required.' });
        return;
      }
      if (state.mailboxes.some((m) => m.localPart === localPart)) {
        res.status(409).json({ error: `Mailbox ${localPart}@${state.config.domain} already exists.` });
        return;
      }

      const newMailbox: MailboxAccount = {
        id: `mbx-${crypto.randomUUID().slice(0, 8)}`,
        localPart,
        domain: state.config.domain,
        displayName,
        role,
        quotaMb,
        usedMb: 0,
        enabled: true,
        createdAt: new Date().toISOString(),
      };

      state.mailboxes = [...state.mailboxes, newMailbox];
      appendLog(
        state,
        'dovecot/imap',
        'info',
        'VMAIL-ADD',
        `Provisioned virtual mailbox ${localPart}@${state.config.domain} (Maildir quota=${quotaMb}MB)`
      );

      const saved = await persistState(state);
      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create mailbox' });
    }
  });

  app.patch('/api/mailboxes/:id', async (req, res) => {
    try {
      const state = await getState();
      const target = state.mailboxes.find((m) => m.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      if (typeof req.body?.enabled === 'boolean') {
        target.enabled = req.body.enabled;
      }
      if (typeof req.body?.quotaMb === 'number') {
        target.quotaMb = Math.max(256, Math.min(102400, req.body.quotaMb));
      }
      appendLog(
        state,
        'dovecot/imap',
        'info',
        'VMAIL-MOD',
        `Updated mailbox ${target.localPart}@${state.config.domain} (enabled=${target.enabled}, quota=${target.quotaMb}MB)`
      );
      const saved = await persistState(state);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update mailbox' });
    }
  });

  app.delete('/api/mailboxes/:id', async (req, res) => {
    try {
      const state = await getState();
      const target = state.mailboxes.find((m) => m.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Mailbox not found' });
        return;
      }
      if (state.mailboxes.length <= 1) {
        res.status(400).json({ error: 'At least one domain mailbox must remain active.' });
        return;
      }
      state.mailboxes = state.mailboxes.filter((m) => m.id !== req.params.id);
      appendLog(
        state,
        'dovecot/imap',
        'warning',
        'VMAIL-DEL',
        `Removed virtual mailbox ${target.localPart}@${state.config.domain} from /etc/postfix/vmailbox`
      );
      const saved = await persistState(state);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete mailbox' });
    }
  });

  app.post('/api/messages/send', async (req, res) => {
    try {
      const state = await getState();
      const fromLocal = String(req.body?.fromLocal || state.mailboxes[0]?.localPart || 'admin').trim();
      const fromAddress = `${fromLocal}@${state.config.domain}`;
      const toAddress = String(req.body?.to || '').trim();
      const subject = String(req.body?.subject || '').trim();
      const body = String(req.body?.body || '').trim();

      if (!toAddress || !toAddress.includes('@')) {
        res.status(400).json({ error: 'Valid recipient email address is required.' });
        return;
      }
      if (!subject || !body) {
        res.status(400).json({ error: 'Subject and message body are required.' });
        return;
      }

      const now = new Date().toISOString();
      const queueId = formatQueueId();
      const messageId = `<${crypto.randomUUID()}@${state.config.mailHostname}>`;
      const dkimSig = signDkimHeader(
        state.config.dkimPrivateKey,
        state.config.domain,
        state.config.dkimSelector,
        fromAddress,
        toAddress,
        subject,
        body
      );

      const rawHeaders = [
        `Return-Path: <${fromAddress}>`,
        `Received: from client (authenticated bits=0) by ${state.config.mailHostname} (Postfix) with ESMTPSA id ${queueId} (version=TLSv1.3 cipher=TLS_AES_256_GCM_SHA384); ${new Date(now).toUTCString()}`,
        `DKIM-Signature: ${dkimSig}`,
        `Message-ID: ${messageId}`,
        `Date: ${new Date(now).toUTCString()}`,
        `From: ${fromAddress}`,
        `To: ${toAddress}`,
        `Subject: ${subject}`,
      ].join('\n');

      const sizeBytes = Buffer.byteLength(rawHeaders + '\n\n' + body, 'utf8');

      const sentMessage: EmailMessage = {
        id: `msg-${crypto.randomUUID().slice(0, 8)}`,
        folder: 'sent',
        from: fromAddress,
        to: toAddress,
        subject,
        body,
        timestamp: now,
        dkimSigned: true,
        dkimSignatureHeader: dkimSig,
        spfStatus: 'pass',
        dmarcStatus: 'pass',
        tlsCipher: 'TLSv1.3 (TLS_AES_256_GCM_SHA384)',
        messageId,
        sizeBytes,
        read: true,
        rawHeaders,
      };

      state.messages = [sentMessage, ...state.messages];

      // Also deliver to local inbox if recipient belongs to the configured domain
      const recipientDomain = toAddress.split('@')[1]?.toLowerCase();
      if (recipientDomain === state.config.domain.toLowerCase()) {
        const inboxCopy: EmailMessage = {
          ...sentMessage,
          id: `msg-${crypto.randomUUID().slice(0, 8)}`,
          folder: 'inbox',
          read: false,
        };
        state.messages = [inboxCopy, ...state.messages];
        appendLog(
          state,
          'dovecot/imap',
          'info',
          queueId,
          `lmtp(dovecot): stored local delivery <${toAddress}> msgid=${messageId} in Maildir`
        );
      }

      appendLog(
        state,
        'postfix/smtpd',
        'info',
        queueId,
        `client=authenticated-submission, sasl_method=PLAIN, sasl_username=${fromAddress}, tls=TLSv1.3`
      );
      appendLog(
        state,
        'opendkim',
        'info',
        queueId,
        `DKIM-Signature field added (s=${state.config.dkimSelector}, d=${state.config.domain}, a=rsa-sha256)`
      );
      appendLog(
        state,
        'postfix/smtp',
        'info',
        queueId,
        `to=<${toAddress}>, relay=${recipientDomain === state.config.domain ? 'dovecot-lmtp' : 'mx-outbound[25]'}, status=sent (250 2.0.0 Ok: queued as ${queueId})`
      );

      const saved = await persistState(state);
      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to dispatch email' });
    }
  });

  app.post('/api/messages/simulate-inbound', async (req, res) => {
    try {
      const state = await getState();
      const sender = String(req.body?.from || 'security-alert@partner-relay.org').trim();
      const targetLocal = String(req.body?.toLocal || state.mailboxes[0]?.localPart || 'admin').trim();
      const recipient = `${targetLocal}@${state.config.domain}`;
      const subject = String(req.body?.subject || `Inbound SMTP Verification Test (${state.config.domain})`).trim();
      const body = String(
        req.body?.body ||
          `Inbound message received over Port 25 STARTTLS and handed off to Dovecot LMTP for ${recipient}.`
      ).trim();
      const spfResult = (req.body?.spfStatus || 'pass') as EmailMessage['spfStatus'];
      const dkimValid = req.body?.dkimSigned !== false;
      const dmarcResult: EmailMessage['dmarcStatus'] =
        spfResult === 'pass' && dkimValid ? 'pass' : state.config.dmarcPolicy === 'reject' ? 'fail' : 'none';

      const now = new Date().toISOString();
      const queueId = formatQueueId();
      const messageId = `<inbound-${crypto.randomUUID().slice(0, 12)}@partner-relay.org>`;
      const folder: EmailMessage['folder'] = dmarcResult === 'fail' ? 'quarantine' : 'inbox';

      const inboundMsg: EmailMessage = {
        id: `msg-${crypto.randomUUID().slice(0, 8)}`,
        folder,
        from: sender,
        to: recipient,
        subject,
        body,
        timestamp: now,
        dkimSigned: dkimValid,
        dkimSignatureHeader: dkimValid ? `v=1; a=rsa-sha256; d=partner-relay.org; s=s1; b=verified` : 'none',
        spfStatus: spfResult,
        dmarcStatus: dmarcResult,
        tlsCipher: 'TLSv1.3 (ECDHE-RSA-AES256-GCM-SHA384)',
        messageId,
        sizeBytes: Buffer.byteLength(body, 'utf8') + 520,
        read: false,
        rawHeaders: [
          `Return-Path: <${sender}>`,
          `Received: from mail.partner-relay.org ([198.51.100.77]) by ${state.config.mailHostname} (Postfix) with ESMTPS id ${queueId}; ${new Date(now).toUTCString()}`,
          `Authentication-Results: ${state.config.mailHostname}; spf=${spfResult}; dkim=${dkimValid ? 'pass' : 'fail'}; dmarc=${dmarcResult} (p=${state.config.dmarcPolicy})`,
          `From: ${sender}`,
          `To: ${recipient}`,
          `Subject: ${subject}`,
        ].join('\n'),
      };

      state.messages = [inboundMsg, ...state.messages];

      appendLog(
        state,
        'postfix/smtpd',
        dmarcResult === 'fail' ? 'warning' : 'info',
        queueId,
        `connect from mail.partner-relay.org[198.51.100.77]: TLSv1.3 established, spf=${spfResult}, dkim=${dkimValid ? 'pass' : 'fail'}`
      );
      appendLog(
        state,
        'dovecot/imap',
        dmarcResult === 'fail' ? 'warning' : 'info',
        queueId,
        `lmtp(<${recipient}>): delivered to folder=${folder.toUpperCase()} (dmarc=${dmarcResult})`
      );

      const saved = await persistState(state);
      res.status(201).json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to receive inbound test' });
    }
  });

  app.patch('/api/messages/:id/read', async (req, res) => {
    const state = await getState();
    const msg = state.messages.find((m) => m.id === req.params.id);
    if (!msg) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    msg.read = true;
    const saved = await persistState(state);
    res.json(saved);
  });

  app.delete('/api/messages/:id', async (req, res) => {
    const state = await getState();
    state.messages = state.messages.filter((m) => m.id !== req.params.id);
    const saved = await persistState(state);
    res.json(saved);
  });

  app.post('/api/dns/verify', async (req, res) => {
    try {
      const state = await getState();
      const targetDomain = String(req.body?.domain || state.config.domain).trim().toLowerCase();
      const selector = String(req.body?.selector || state.config.dkimSelector).trim();
      const errors: string[] = [];

      let mxRecords: { exchange: string; priority: number }[] = [];
      let aRecords: string[] = [];
      let ptrRecords: string[] = [];
      let txtRecords: string[] = [];
      let dmarcRecord: string | null = null;
      let dkimRecord: string | null = null;

      try {
        mxRecords = await dns.resolveMx(targetDomain);
      } catch (e) {
        errors.push(`MX lookup: ${e instanceof Error ? e.message : 'failed'}`);
      }

      try {
        const mailHost =
          targetDomain === state.config.domain ? state.config.mailHostname : `mail.${targetDomain}`;
        aRecords = await dns.resolve4(mailHost);
        if (aRecords.length > 0) {
          try {
            ptrRecords = await dns.reverse(aRecords[0]);
          } catch {
            // PTR optional
          }
        }
      } catch {
        try {
          aRecords = await dns.resolve4(targetDomain);
        } catch (e) {
          errors.push(`A lookup: ${e instanceof Error ? e.message : 'failed'}`);
        }
      }

      try {
        const rawTxt = await dns.resolveTxt(targetDomain);
        txtRecords = rawTxt.map((chunks) => chunks.join(''));
      } catch (e) {
        errors.push(`TXT/SPF lookup: ${e instanceof Error ? e.message : 'failed'}`);
      }

      try {
        const dmarcTxt = await dns.resolveTxt(`_dmarc.${targetDomain}`);
        const flat = dmarcTxt.map((chunks) => chunks.join(''));
        dmarcRecord = flat.find((t) => t.toLowerCase().startsWith('v=dmarc1')) || flat[0] || null;
      } catch {
        dmarcRecord = null;
      }

      try {
        const dkimTxt = await dns.resolveTxt(`${selector}._domainkey.${targetDomain}`);
        const flat = dkimTxt.map((chunks) => chunks.join(''));
        dkimRecord = flat.find((t) => t.toLowerCase().includes('v=dkim1')) || flat[0] || null;
      } catch {
        dkimRecord = null;
      }

      const spfRecord = txtRecords.find((t) => t.toLowerCase().startsWith('v=spf1')) || null;

      const result: DnsCheckResult = {
        domain: targetDomain,
        selector,
        mxRecords: mxRecords.sort((a, b) => a.priority - b.priority),
        aRecords,
        ptrRecords,
        txtRecords,
        spfRecord,
        dmarcRecord,
        dkimRecord,
        checkedAt: new Date().toISOString(),
        errors,
      };

      appendLog(
        state,
        'pipeline',
        errors.length > 0 && mxRecords.length === 0 ? 'warning' : 'info',
        'DNS-CHECK',
        `Live DNS verification for ${targetDomain}: MX=${mxRecords.length}, SPF=${spfRecord ? 'found' : 'missing'}, DMARC=${dmarcRecord ? 'found' : 'missing'}, DKIM(${selector})=${dkimRecord ? 'found' : 'missing'}`
      );
      await persistState(state);

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'DNS check failed' });
    }
  });

  app.post('/api/network/probe', async (req, res) => {
    try {
      const state = await getState();
      const host = String(req.body?.host || state.config.mailHostname).trim();

      const targets: Array<{
        port: number;
        service: string;
        protocol: PortProbeResult['protocol'];
      }> = [
        { port: 25, service: 'Postfix SMTP Inbound', protocol: 'SMTP' },
        { port: 587, service: 'Postfix Submission (STARTTLS)', protocol: 'SUBMISSION' },
        { port: 465, service: 'Postfix SMTPS (Implicit TLS)', protocol: 'SMTPS' },
        { port: 143, service: 'Dovecot IMAP (STARTTLS)', protocol: 'IMAP' },
        { port: 993, service: 'Dovecot IMAPS (Implicit TLS)', protocol: 'IMAPS' },
      ];

      const results = await Promise.all(
        targets.map((t) => probeMailPort(host, t.port, t.service, t.protocol))
      );

      appendLog(
        state,
        'certbot',
        'info',
        'NET-PROBE',
        `Probed SMTP/IMAP ports on ${host}: ${results.filter((r) => r.reachable).length}/${results.length} reachable`
      );
      await persistState(state);

      res.json({ host, checkedAt: new Date().toISOString(), results });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Port probe failed' });
    }
  });

  app.patch('/api/deployment/:stepId', async (req, res) => {
    try {
      const state = await getState();
      const step = state.deploymentSteps.find((s) => s.id === req.params.stepId);
      if (!step) {
        res.status(404).json({ error: 'Deployment step not found' });
        return;
      }
      const nextStatus = req.body?.status as StepStatus;
      if (!['pending', 'in_progress', 'completed'].includes(nextStatus)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      step.status = nextStatus;
      step.updatedAt = new Date().toISOString();

      appendLog(
        state,
        'pipeline',
        'info',
        `STEP-0${step.order}`,
        `Deployment stage "${step.title}" marked ${nextStatus.toUpperCase()}; README.md synchronized`
      );

      const saved = await persistState(state);
      res.json(saved);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update step' });
    }
  });

  app.get('/api/bundle', async (_req, res) => {
    try {
      const state = await getState();
      const bundle = {
        generatedAt: new Date().toISOString(),
        domain: state.config.domain,
        files: {
          'README.md': state.readmeMarkdown,
          'etc/postfix/main.cf': generatePostfixMainCf(state.config),
          'etc/postfix/master.cf': generatePostfixMasterCf(state.config),
          'etc/dovecot/conf.d/99-postforge.conf': generateDovecotConf(
            state.config,
            state.mailboxes
          ),
          'etc/opendkim.conf': generateOpenDkimConfig(state.config),
          'dns-records.txt': [
            `SPF: ${buildSpfValue(state.config)}`,
            `DKIM (${state.config.dkimSelector}._domainkey.${state.config.domain}): ${buildDkimDnsValue(state.config)}`,
            `DMARC (_dmarc.${state.config.domain}): ${buildDmarcValue(state.config)}`,
          ].join('\n\n'),
          'scripts/ufw-and-fail2ban.sh': generateFirewallAndFail2ban(state.config),
          'monitoring/promtail-mail.yml': generateMonitoringConfig(state.config),
          '.github/workflows/deploy-mailserver.yml': generateDeployPipelineYaml(state.config),
          'scripts/provision-mailserver.sh': generateProvisionScript(
            state.config,
            state.mailboxes
          ),
        },
      };
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="postforge-${state.config.domain}-bundle.json"`
      );
      res.json(bundle);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to build bundle' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PostForge mail server console listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
