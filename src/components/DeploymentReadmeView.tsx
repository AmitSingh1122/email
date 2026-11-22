import { useState } from 'react';
import type { DeploymentStep, DomainConfig, MailboxAccount, StepStatus } from '../types/mail';
import {
  generateDeployPipelineYaml,
  generateProvisionScript,
} from '../utils/configGenerators';
import { CodeBlock } from './CodeBlock';

interface DeploymentReadmeViewProps {
  config: DomainConfig;
  mailboxes: MailboxAccount[];
  steps: DeploymentStep[];
  readmeMarkdown: string;
  onUpdateStepStatus: (stepId: string, status: StepStatus) => Promise<void>;
}

export function DeploymentReadmeView({
  config,
  mailboxes,
  steps,
  readmeMarkdown,
  onUpdateStepStatus,
}: DeploymentReadmeViewProps) {
  const [activeTab, setActiveTab] = useState<'readme' | 'pipeline' | 'provision'>('readme');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const progressPct = Math.round((completedCount / Math.max(steps.length, 1)) * 100);

  const handleStatusChange = async (stepId: string, status: StepStatus) => {
    setUpdatingId(stepId);
    try {
      await onUpdateStepStatus(stepId, status);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Deployment Pipeline Progress */}
      <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Production Deployment Pipeline & Checklist
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track rollout stages for <span className="font-mono">{config.mailHostname}</span>. Every stage update automatically writes to <span className="font-mono">README.md</span>.
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-900 tabular-nums">
              {completedCount} of {steps.length} Complete ({progressPct}%)
            </div>
            <div className="w-44 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {steps.map((step) => (
            <div
              key={step.id}
              className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    0{step.order}.
                  </span>
                  <span>{step.phase}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      step.status === 'completed'
                        ? 'text-emerald-700 font-medium'
                        : step.status === 'in_progress'
                          ? 'text-blue-700 font-medium'
                          : 'text-slate-500 font-medium'
                    }
                  >
                    {step.status === 'completed'
                      ? 'Completed'
                      : step.status === 'in_progress'
                        ? 'In Progress'
                        : 'Pending'}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                <p className="text-xs text-slate-600">{step.description}</p>
                <div className="text-xs font-mono text-slate-500 truncate pt-0.5">
                  Verify: {step.verificationCmd}
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start lg:self-center">
                {(['pending', 'in_progress', 'completed'] as StepStatus[]).map((statusOption) => (
                  <button
                    key={statusOption}
                    type="button"
                    disabled={updatingId === step.id}
                    onClick={() => handleStatusChange(step.id, statusOption)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      step.status === statusOption
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {statusOption === 'pending'
                      ? 'Pending'
                      : statusOption === 'in_progress'
                        ? 'In Progress'
                        : 'Completed'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Living Documentation & Pipeline Export */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Living README.md & CI/CD Pipeline Artifacts
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Synchronized continuously with your active domain, DNS records, firewall rules, and deployment checklist.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('readme')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'readme'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Living README.md
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pipeline')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'pipeline'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              GitHub Actions CI/CD
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('provision')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'provision'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Server Bootstrap Script
            </button>
          </div>
        </div>

        {activeTab === 'readme' && (
          <CodeBlock
            title="README.md (Live Repository Snapshot)"
            subtitle="Automatically persisted to /README.md on every configuration or pipeline update"
            code={readmeMarkdown}
            filename="README.md"
            maxHeightClass="max-h-[540px]"
          />
        )}
        {activeTab === 'pipeline' && (
          <CodeBlock
            title=".github/workflows/deploy-mailserver.yml"
            subtitle="Automated DNS verification and SSH config reload workflow"
            code={generateDeployPipelineYaml(config)}
            filename="deploy-mailserver.yml"
            maxHeightClass="max-h-[540px]"
          />
        )}
        {activeTab === 'provision' && (
          <CodeBlock
            title="scripts/provision-mailserver.sh"
            subtitle="One-shot Ubuntu/Debian setup for Postfix, Dovecot, OpenDKIM, Certbot, UFW, and Fail2ban"
            code={generateProvisionScript(config, mailboxes)}
            filename="provision-mailserver.sh"
            maxHeightClass="max-h-[540px]"
          />
        )}
      </section>
    </div>
  );
}
