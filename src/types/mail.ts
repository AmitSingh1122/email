export type SpfPolicy = '-all' | '~all' | '?all';
export type DmarcPolicy = 'reject' | 'quarantine' | 'none';
export type TlsMode = 'letsencrypt' | 'custom_pem' | 'self_signed';
export type MailFolder = 'inbox' | 'sent' | 'quarantine';
export type StepStatus = 'pending' | 'in_progress' | 'completed';

export interface DomainConfig {
  domain: string;
  mailHostname: string;
  serverIp: string;
  dkimSelector: string;
  dkimPublicKey: string;
  dkimPrivateKey: string;
  dkimCreatedAt: string;
  spfPolicy: SpfPolicy;
  spfInclude: string;
  dmarcPolicy: DmarcPolicy;
  dmarcRua: string;
  tlsMode: TlsMode;
  tlsEmail: string;
  enableSubmission587: boolean;
  enableSmtps465: boolean;
  enableImaps993: boolean;
  enableFirewall: boolean;
  sshPort: number;
  allowedSshCidr: string;
  enableFail2ban: boolean;
  enableMonitoring: boolean;
  updatedAt: string;
}

export interface MailboxAccount {
  id: string;
  localPart: string;
  domain: string;
  displayName: string;
  role: string;
  quotaMb: number;
  usedMb: number;
  enabled: boolean;
  createdAt: string;
}

export interface EmailMessage {
  id: string;
  folder: MailFolder;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  dkimSigned: boolean;
  dkimSignatureHeader: string;
  spfStatus: 'pass' | 'softfail' | 'neutral' | 'fail';
  dmarcStatus: 'pass' | 'fail' | 'none';
  tlsCipher: string;
  messageId: string;
  sizeBytes: number;
  read: boolean;
  rawHeaders: string;
}

export interface MailLogEntry {
  id: string;
  timestamp: string;
  service:
    | 'postfix/smtpd'
    | 'postfix/smtp'
    | 'dovecot/imap'
    | 'opendkim'
    | 'fail2ban'
    | 'ufw'
    | 'certbot'
    | 'pipeline';
  severity: 'info' | 'warning' | 'error';
  queueId: string;
  message: string;
}

export interface DnsCheckResult {
  domain: string;
  selector: string;
  mxRecords: { exchange: string; priority: number }[];
  aRecords: string[];
  ptrRecords: string[];
  txtRecords: string[];
  spfRecord: string | null;
  dmarcRecord: string | null;
  dkimRecord: string | null;
  checkedAt: string;
  errors: string[];
}

export interface PortProbeResult {
  port: number;
  service: string;
  protocol: 'SMTP' | 'SUBMISSION' | 'SMTPS' | 'IMAP' | 'IMAPS';
  reachable: boolean;
  tlsSupported: boolean;
  tlsProtocol: string | null;
  banner: string | null;
  latencyMs: number;
  error: string | null;
}

export interface DeploymentStep {
  id: string;
  order: number;
  phase: string;
  title: string;
  description: string;
  status: StepStatus;
  verificationCmd: string;
  updatedAt: string;
}

export interface PlatformState {
  config: DomainConfig;
  mailboxes: MailboxAccount[];
  messages: EmailMessage[];
  logs: MailLogEntry[];
  deploymentSteps: DeploymentStep[];
  readmeMarkdown: string;
}
