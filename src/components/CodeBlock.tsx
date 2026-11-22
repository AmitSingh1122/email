import { Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';

interface CodeBlockProps {
  title: string;
  subtitle?: string;
  code: string;
  filename?: string;
  maxHeightClass?: string;
}

export function CodeBlock({
  title,
  subtitle,
  code,
  filename,
  maxHeightClass = 'max-h-[460px]',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const handleDownload = () => {
    if (!filename) return;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50/70">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-900 font-mono truncate">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filename && (
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre
        className={`p-4 text-xs leading-relaxed font-mono text-slate-800 bg-slate-50/40 overflow-auto ${maxHeightClass}`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
