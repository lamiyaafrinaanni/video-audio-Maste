import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Terminal, 
  Code, 
  Play, 
  Copy, 
  Check, 
  RefreshCw, 
  Radio, 
  Server, 
  Zap, 
  Layers, 
  FileText, 
  Activity,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { Language, McpToolDefinition, HeadlessAgentLog } from '../types';

interface McpAgentHubProps {
  lang: Language;
  onAnalysisTriggered?: (result: string) => void;
}

const MCP_TOOLS_LIST: McpToolDefinition[] = [
  {
    name: 'analyze_video_url',
    description: 'Perform deep AI video analysis on a video URL. Extracts step-by-step summary, problems, advantages/disadvantages, and actionable recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Direct accessible URL of the video (mp4, webm)' },
        mode: { type: 'string', enum: ['standard', 'problem_solving', 'learning_points'], default: 'standard' },
        language: { type: 'string', enum: ['bn', 'en'], default: 'bn' },
        customPrompt: { type: 'string', description: 'Optional custom focus instructions' }
      },
      required: ['url']
    }
  },
  {
    name: 'extract_problem_solutions',
    description: 'Extract targeted problems, root causes, pros/cons, and recommended action steps from video context.',
    inputSchema: {
      type: 'object',
      properties: {
        videoDescriptionOrUrl: { type: 'string', description: 'Video URL, context, or transcript' },
        language: { type: 'string', enum: ['bn', 'en'], default: 'bn' }
      },
      required: ['videoDescriptionOrUrl']
    }
  },
  {
    name: 'extract_learning_points',
    description: 'Extract pedagogical key takeaways, core concepts, and practical real-world exercises from video content.',
    inputSchema: {
      type: 'object',
      properties: {
        videoDescriptionOrUrl: { type: 'string', description: 'Video URL or context' },
        language: { type: 'string', enum: ['bn', 'en'], default: 'bn' }
      },
      required: ['videoDescriptionOrUrl']
    }
  },
  {
    name: 'generate_audit_prompt',
    description: 'Generate fine-tuned video analysis prompt blueprints for software bug triage, UI/UX demo review, or lecture analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: ['bug_triage', 'ui_ux_review', 'educational_lecture', 'general'], default: 'general' },
        language: { type: 'string', enum: ['bn', 'en'], default: 'bn' }
      },
      required: ['domain']
    }
  },
  {
    name: 'get_analysis_history',
    description: 'Retrieve previous analysis results and summaries from the server session.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10 }
      }
    }
  }
];

export const McpAgentHub: React.FC<McpAgentHubProps> = ({ lang }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string>('analyze_video_url');
  const [toolArgs, setToolArgs] = useState<Record<string, any>>({
    url: '',
    mode: 'standard',
    language: lang,
    videoDescriptionOrUrl: '',
    domain: 'bug_triage'
  });
  
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [executionLatency, setExecutionLatency] = useState<number | null>(null);
  const [logs, setLogs] = useState<HeadlessAgentLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [configTab, setConfigTab] = useState<'claude' | 'cursor' | 'python' | 'curl'>('claude');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const mcpEndpoint = `${origin}/mcp`;
  const sseEndpoint = `${origin}/sse`;
  const restEndpoint = `${origin}/api/analyze`;
  const manifestEndpoint = `${origin}/api/mcp/manifest`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs) {
          setLogs(data.logs);
        }
      }
    } catch (e) {
      console.error('Failed to fetch server logs', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExecuteTool = async () => {
    setIsExecuting(true);
    setExecutionResult(null);
    setExecutionLatency(null);
    const startTime = performance.now();

    const toolDef = MCP_TOOLS_LIST.find((t) => t.name === selectedTool);
    const filteredArgs: Record<string, any> = {};

    if (toolDef?.inputSchema?.properties) {
      Object.keys(toolDef.inputSchema.properties).forEach((prop) => {
        if (toolArgs[prop] !== undefined) {
          filteredArgs[prop] = toolArgs[prop];
        }
      });
    }

    const payload = {
      jsonrpc: '2.0',
      id: 'test_' + Date.now(),
      method: 'tools/call',
      params: {
        name: selectedTool,
        arguments: filteredArgs
      }
    };

    try {
      const response = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      const elapsed = Math.round(performance.now() - startTime);
      setExecutionLatency(elapsed);
      setExecutionResult(data);
      fetchLogs();
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - startTime);
      setExecutionLatency(elapsed);
      setExecutionResult({
        jsonrpc: '2.0',
        id: payload.id,
        error: { code: -32000, message: err.message || 'Execution failed' }
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const claudeConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        "video-insight-ai": {
          url: mcpEndpoint,
          transport: "http"
        }
      }
    },
    null,
    2
  );

  const cursorConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        "video-insight-ai": {
          url: sseEndpoint,
          type: "sse"
        }
      }
    },
    null,
    2
  );

  const pythonSnippet = `import requests

# Model Context Protocol (MCP) JSON-RPC 2.0 Direct Invocation
mcp_url = "${mcpEndpoint}"

payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "analyze_video_url",
        "arguments": {
            "url": "https://example.com/video.mp4",
            "mode": "problem_solving",
            "language": "bn"
        }
    }
}

response = requests.post(mcp_url, json=payload)
print(response.json()["result"]["content"][0]["text"])`;

  const curlSnippet = `curl -X POST ${mcpEndpoint} \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "analyze_video_url",
      "arguments": {
        "url": "${toolArgs.url || 'https://example.com/video.mp4'}",
        "mode": "standard",
        "language": "${lang}"
      }
    }
  }'`;

  return (
    <div className="space-y-6">
      {/* Top Banner: Headless & MCP Status */}
      <div className="bg-[#1c1c1c] text-[#E4E3E0] p-6 rounded-xl border border-black/20 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bot className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold tracking-tight">
                  {lang === 'bn' ? 'হেডলেস ও MCP এজেন্ট পোর্টাল' : 'Headless & MCP Agent Portal'}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Radio className="w-3 h-3 animate-ping" />
                  {lang === 'bn' ? 'MCP সার্ভার সক্রিয় (Online)' : 'MCP Server Active (Online)'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                {lang === 'bn' 
                  ? 'যেকোনো স্বায়ত্তশাসিত AI এজেন্ট (Claude, Cursor, Windsurf, LangChain) এই সার্ভারের সাথে সরাসরি সংযুক্ত হতে পারে।' 
                  : 'Any autonomous AI agent (Claude Desktop, Cursor, Windsurf, LangChain) can invoke this server over standard MCP protocols.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a 
              href={manifestEndpoint} 
              target="_blank" 
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors text-neutral-300"
            >
              <FileText className="w-3.5 h-3.5" />
              {lang === 'bn' ? 'মেনিফেস্ট (JSON)' : 'Manifest (JSON)'}
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-60" />
            </a>
            <button
              onClick={fetchLogs}
              className="p-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition-colors text-neutral-300"
              title="Refresh logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Endpoints Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-1">
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
              <span className="font-mono flex items-center gap-1.5">
                <Server className="w-3 h-3 text-emerald-400" />
                MCP JSON-RPC Endpoint
              </span>
              <button
                onClick={() => copyToClipboard(mcpEndpoint, 'mcp')}
                className="hover:text-white transition-colors"
                title="Copy endpoint"
              >
                {copiedKey === 'mcp' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <code className="text-xs text-emerald-300 font-mono break-all select-all">
              {mcpEndpoint}
            </code>
          </div>

          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
              <span className="font-mono flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-cyan-400" />
                MCP SSE Stream URL
              </span>
              <button
                onClick={() => copyToClipboard(sseEndpoint, 'sse')}
                className="hover:text-white transition-colors"
                title="Copy endpoint"
              >
                {copiedKey === 'sse' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <code className="text-xs text-cyan-300 font-mono break-all select-all">
              {sseEndpoint}
            </code>
          </div>

          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="flex items-center justify-between text-xs text-neutral-400 mb-1">
              <span className="font-mono flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-400" />
                Headless REST Endpoint
              </span>
              <button
                onClick={() => copyToClipboard(restEndpoint, 'rest')}
                className="hover:text-white transition-colors"
                title="Copy endpoint"
              >
                {copiedKey === 'rest' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <code className="text-xs text-amber-300 font-mono break-all select-all">
              {restEndpoint}
            </code>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Playground (Left) + Client Configs (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Interactive MCP Tool Tester (7 cols) */}
        <div className="lg:col-span-7 bg-[var(--surface-card)] p-5 rounded-xl border border-[var(--border-subtle)] shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-[var(--text-primary)]" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  {lang === 'bn' ? 'ইন্টারেক্টিভ MCP টুল টেস্ট প্লেগ্রাউন্ড' : 'Interactive MCP Tool Tester'}
                </h3>
              </div>
              <span className="text-xs font-mono text-[var(--text-muted)]">
                JSON-RPC 2.0 Spec (2024-11-05)
              </span>
            </div>

            {/* Tool Selection */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1.5">
                  {lang === 'bn' ? 'MCP টুল নির্বাচন করুন' : 'Select MCP Tool'}
                </label>
                <select
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                  className="w-full text-xs font-mono bg-[var(--surface-muted)] border border-[var(--border-strong)] rounded-lg p-2.5 text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  {MCP_TOOLS_LIST.map((tool) => (
                    <option key={tool.name} value={tool.name}>
                      {tool.name} — {tool.description.substring(0, 55)}...
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Arguments Input */}
              <div className="bg-[var(--surface-muted)]/50 p-3.5 rounded-lg border border-[var(--border-subtle)] space-y-3">
                <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Code className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  {lang === 'bn' ? 'টুল প্যারামিটার (Arguments)' : 'Tool Input Arguments'}
                </div>

                {(selectedTool === 'analyze_video_url') && (
                  <>
                    <div>
                      <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                        url (string)
                      </label>
                      <input
                        type="text"
                        value={toolArgs.url || ''}
                        onChange={(e) => setToolArgs({ ...toolArgs, url: e.target.value })}
                        className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-2 text-[var(--text-primary)] placeholder:text-[var(--text-light)]"
                        placeholder="https://example.com/video.mp4"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                          mode
                        </label>
                        <select
                          value={toolArgs.mode || 'standard'}
                          onChange={(e) => setToolArgs({ ...toolArgs, mode: e.target.value })}
                          className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-1.5 text-[var(--text-primary)]"
                        >
                          <option value="standard">standard</option>
                          <option value="problem_solving">problem_solving</option>
                          <option value="learning_points">learning_points</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                          language
                        </label>
                        <select
                          value={toolArgs.language || lang}
                          onChange={(e) => setToolArgs({ ...toolArgs, language: e.target.value })}
                          className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-1.5 text-[var(--text-primary)]"
                        >
                          <option value="bn">bn (বাংলা)</option>
                          <option value="en">en (English)</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {(selectedTool === 'extract_problem_solutions' || selectedTool === 'extract_learning_points') && (
                  <div>
                    <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                      videoDescriptionOrUrl (string)
                    </label>
                    <textarea
                      rows={3}
                      value={toolArgs.videoDescriptionOrUrl || ''}
                      onChange={(e) => setToolArgs({ ...toolArgs, videoDescriptionOrUrl: e.target.value })}
                      className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-2 text-[var(--text-primary)] placeholder:text-[var(--text-light)]"
                      placeholder="Video URL or descriptive context..."
                    />
                  </div>
                )}

                {selectedTool === 'generate_audit_prompt' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                        domain
                      </label>
                      <select
                        value={toolArgs.domain || 'general'}
                        onChange={(e) => setToolArgs({ ...toolArgs, domain: e.target.value })}
                        className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-1.5 text-[var(--text-primary)]"
                      >
                        <option value="bug_triage">bug_triage</option>
                        <option value="ui_ux_review">ui_ux_review</option>
                        <option value="educational_lecture">educational_lecture</option>
                        <option value="general">general</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                        language
                      </label>
                      <select
                        value={toolArgs.language || lang}
                        onChange={(e) => setToolArgs({ ...toolArgs, language: e.target.value })}
                        className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-1.5 text-[var(--text-primary)]"
                      >
                        <option value="bn">bn (বাংলা)</option>
                        <option value="en">en (English)</option>
                      </select>
                    </div>
                  </div>
                )}

                {selectedTool === 'get_analysis_history' && (
                  <div>
                    <label className="block text-[11px] font-mono text-[var(--text-muted)] mb-1">
                      limit (number)
                    </label>
                    <input
                      type="number"
                      value={toolArgs.limit || 10}
                      onChange={(e) => setToolArgs({ ...toolArgs, limit: parseInt(e.target.value, 10) || 10 })}
                      className="w-full text-xs font-mono bg-[var(--surface-card)] border border-[var(--border-strong)] rounded p-2 text-[var(--text-primary)]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <button
              onClick={handleExecuteTool}
              disabled={isExecuting}
              className="w-full py-2.5 px-4 bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {lang === 'bn' ? 'MCP টুল এক্সিকিউট হচ্ছে...' : 'Executing MCP Tool Call...'}
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {lang === 'bn' ? 'MCP টুল কল চালান (Run Tool Call)' : 'Execute MCP Tool Call'}
                </>
              )}
            </button>

            {/* Execution Result Box */}
            {executionResult && (
              <div className="bg-[#141414] text-neutral-200 p-4 rounded-lg border border-black/20 text-xs font-mono max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[11px] text-neutral-400">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Response 200 OK
                  </span>
                  {executionLatency && (
                    <span className="text-neutral-400">
                      Latency: {executionLatency}ms
                    </span>
                  )}
                </div>
                <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-neutral-300">
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Client Integration Snippets (5 cols) */}
        <div className="lg:col-span-5 bg-[var(--surface-card)] p-5 rounded-xl border border-[var(--border-subtle)] shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-[var(--text-primary)]" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  {lang === 'bn' ? 'এজেন্ট কনফিগারেশন কোড' : 'Agent Config Snippets'}
                </h3>
              </div>
            </div>

            {/* Tab Selector for Configs */}
            <div className="flex rounded-lg bg-[var(--surface-muted)] p-1 mb-3 text-xs">
              <button
                onClick={() => setConfigTab('claude')}
                className={`flex-1 py-1.5 font-medium rounded-md transition-all cursor-pointer ${
                  configTab === 'claude' ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Claude Desktop
              </button>
              <button
                onClick={() => setConfigTab('cursor')}
                className={`flex-1 py-1.5 font-medium rounded-md transition-all cursor-pointer ${
                  configTab === 'cursor' ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Cursor / IDE
              </button>
              <button
                onClick={() => setConfigTab('python')}
                className={`flex-1 py-1.5 font-medium rounded-md transition-all cursor-pointer ${
                  configTab === 'python' ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Python
              </button>
              <button
                onClick={() => setConfigTab('curl')}
                className={`flex-1 py-1.5 font-medium rounded-md transition-all cursor-pointer ${
                  configTab === 'curl' ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                cURL
              </button>
            </div>

            {/* Code Snippet Box */}
            <div className="relative bg-[#141414] text-neutral-200 p-3.5 rounded-lg border border-black/20 text-xs font-mono">
              <button
                onClick={() => {
                  const text =
                    configTab === 'claude'
                      ? claudeConfigSnippet
                      : configTab === 'cursor'
                      ? cursorConfigSnippet
                      : configTab === 'python'
                      ? pythonSnippet
                      : curlSnippet;
                  copyToClipboard(text, 'snippet');
                }}
                className="absolute top-2.5 right-2.5 p-1.5 bg-white/10 hover:bg-white/20 rounded text-neutral-300 transition-colors cursor-pointer"
                title="Copy Snippet"
              >
                {copiedKey === 'snippet' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <div className="text-[11px] text-neutral-400 mb-2 pb-1 border-b border-white/10 flex items-center justify-between">
                <span>
                  {configTab === 'claude' && 'claude_desktop_config.json'}
                  {configTab === 'cursor' && 'cursor_mcp_config.json'}
                  {configTab === 'python' && 'mcp_agent_client.py'}
                  {configTab === 'curl' && 'Terminal bash command'}
                </span>
              </div>

              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-emerald-300 max-h-56 overflow-y-auto pr-6">
                {configTab === 'claude' && claudeConfigSnippet}
                {configTab === 'cursor' && cursorConfigSnippet}
                {configTab === 'python' && pythonSnippet}
                {configTab === 'curl' && curlSnippet}
              </pre>
            </div>

            {/* Quick Setup Guide */}
            <div className="mt-4 bg-[var(--surface-muted)]/50 p-3.5 rounded-lg border border-[var(--border-subtle)] text-xs space-y-2">
              <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                {lang === 'bn' ? 'ব্যবহারের সহজ নিয়ম' : 'Quick Instructions'}
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed text-[11px]">
                {configTab === 'claude' && (
                  lang === 'bn'
                    ? '১. আপনার Claude Desktop এর সেটিংস থেকে claude_desktop_config.json ফাইলটি খুলুন। ২. উপরের কোডটি পেস্ট করে সেভ করুন। ৩. Claude পুনরায় চালু করলে ভিডিও বিশ্লেষণ টুল স্বয়ংক্রিয়ভাবে যুক্ত হয়ে যাবে।'
                    : '1. Open Claude Desktop settings -> Developer -> Edit Config. 2. Paste the JSON config above and restart Claude. 3. Video analysis tools are immediately ready to use.'
                )}
                {configTab === 'cursor' && (
                  lang === 'bn'
                    ? 'Cursor বা Windsurf এর Features -> MCP Servers এ গিয়ে "video-insight-ai" নামে যুক্ত করুন এবং টাইপ হিসেবে SSE দিন।'
                    : 'In Cursor or Windsurf settings, go to MCP Servers, click Add New Server with type "sse" and the SSE Stream URL.'
                )}
                {configTab === 'python' && (
                  lang === 'bn'
                    ? 'Python এ যেকোনো কাস্টম AI এজেন্ট বা বট সরাসরি HTTP POST রিকোয়েস্ট পাঠিয়ে আউটপুট পেতে পারে।'
                    : 'Standard Python requests or official MCP Python SDK can send JSON-RPC 2.0 payloads directly.'
                )}
                {configTab === 'curl' && (
                  lang === 'bn'
                    ? 'টার্মিনাল থেকে সরাসরি একটি কমান্ড রান করেই যেকোনো ভিডিওর বিশ্লেষণ পেয়ে যান।'
                    : 'Execute directly in your terminal or automation CI/CD pipelines.'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Server Activity Logs */}
      <div className="bg-[#1c1c1c] text-[#E4E3E0] p-5 rounded-xl border border-black/20 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm">
              {lang === 'bn' ? 'রিয়েলটাইম MCP ও হেডলেস এজেন্ট ইভেন্ট লগ' : 'Realtime MCP & Headless Activity Logs'}
            </h3>
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            {logs.length} {lang === 'bn' ? 'টি ইভেন্ট' : 'events recorded'}
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-6 text-xs text-neutral-500 font-mono">
            {lang === 'bn' ? 'এখনো কোনো এজেন্ট রিকোয়েস্ট আসেনি। উপরের প্লেগ্রাউন্ড থেকে কল চালান।' : 'No agent events yet. Try invoking a tool call above!'}
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto font-mono text-[11px]">
            {logs.map((log) => (
              <div 
                key={log.id} 
                className="flex items-center justify-between p-2 rounded bg-black/40 border border-white/5 hover:border-white/15 transition-colors"
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    log.source === 'MCP' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {log.source}
                  </span>
                  <span className="font-semibold text-neutral-200">{log.action}</span>
                  <span className="text-neutral-400 truncate max-w-md">{log.details}</span>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  {log.latencyMs !== undefined && (
                    <span className="text-neutral-500 text-[10px]">{log.latencyMs}ms</span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    log.status === 'success' ? 'text-emerald-400 bg-emerald-500/10' :
                    log.status === 'error' ? 'text-rose-400 bg-rose-500/10' : 'text-amber-400 bg-amber-500/10'
                  }`}>
                    {log.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
