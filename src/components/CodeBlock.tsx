import { Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet.${language.toLowerCase() || 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-5 overflow-hidden rounded-[14px] border border-[#d5dbe5] bg-[#e9edf3]">
      <div className="flex items-center justify-between border-b border-[#d5dbe5] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-wide text-slate-700 uppercase">{language || 'SQL'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDownload}
            className="rounded-md p-1.5 text-slate-500 hover:text-slate-700 transition-colors"
            title="Download"
          >
            <Download size={14} />
          </button>
          <button
            onClick={handleCopy}
            className="rounded-md p-1.5 text-slate-500 hover:text-slate-700 transition-colors"
            title="Copy"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="p-2.5">
        <SyntaxHighlighter
          language={language.toLowerCase() || 'sql'}
          style={oneLight}
          codeTagProps={{ style: { background: 'transparent' } }}
          customStyle={{
            margin: 0,
            padding: '1rem 1rem',
            background: 'transparent',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            lineHeight: '1.65',
            color: '#1e293b',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
