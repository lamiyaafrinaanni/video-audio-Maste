export type Language = 'bn' | 'en';

export type ThemeMode = 'system' | 'light' | 'dark';

export type AnalysisMode = 'standard' | 'problem_solving' | 'learning_points' | 'goal_category';

export interface HighlightFrame {
  id: string;
  timestamp: number;
  dataUrl: string;
  originalDataUrl?: string;
  note: string;
  isSuggestingLabel?: boolean;
  suggestedLabel?: string;
}

export interface ChapterMarker {
  id: string;
  timestamp: number;
  timestampFormatted: string;
  title: string;
  summary: string;
  transitionType?: string;
}

export interface AnalysisHistory {
  id: string;
  title: string;
  date: string;
  result: string;
  type: 'file' | 'url' | 'mcp' | 'agent';
  mode?: string;
  lang?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface HeadlessAgentLog {
  id: string;
  timestamp: string;
  source: 'MCP' | 'REST' | 'UI';
  action: string;
  status: 'success' | 'error' | 'processing';
  details: string;
  latencyMs?: number;
}

export interface TranscriptSegment {
  id: string;
  start: number; // in seconds
  end?: number;
  timestamp: string; // e.g. "00:15"
  speaker?: string;
  text: string;
}

export interface VideoTranscript {
  fullText: string;
  segments: TranscriptSegment[];
  durationSeconds?: number;
  languageDetected?: string;
  extractedAt: string;
  audioUrl?: string;
  audioSizeFormatted?: string;
  isApiKeyError?: boolean;
}

export interface VideoMetadata {
  title: string;
  thumbnailUrl: string;
  fallbackThumbnailUrl?: string;
  duration?: number; // in seconds
  durationFormatted?: string; // e.g. "04:32"
  publisher?: string;
  publisherChannelUrl?: string;
  platform?: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'vimeo' | 'file' | 'direct';
  platformLabel?: string;
  format?: string;
  fileSize?: string;
  originalUrl?: string;
  publishedDate?: string;
  qualityBadge?: string;
}

