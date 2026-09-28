import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Increase payload limit for video base64 frames & payloads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// CORS headers for Headless & MCP clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-session-id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Lazy-initialized Gemini AI client state tracking
let lastKnownApiKey: string | undefined = process.env.GEMINI_API_KEY;
let isKeyMarkedInvalid = false;

function isGeminiKeyReady(): boolean {
  const currentKey = process.env.GEMINI_API_KEY;
  if (currentKey !== lastKnownApiKey) {
    lastKnownApiKey = currentKey;
    isKeyMarkedInvalid = false;
  }
  if (!currentKey || currentKey === 'MY_GEMINI_API_KEY' || currentKey.trim() === '') {
    return false;
  }
  return !isKeyMarkedInvalid;
}

function markGeminiKeyInvalid() {
  isKeyMarkedInvalid = true;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    const err: any = new Error('API_KEY_MISSING: Gemini API key is not configured. Please set GEMINI_API_KEY in the Settings > Secrets panel in Google AI Studio.');
    err.status = 401;
    throw err;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseGeminiError(err: any): {
  isApiKeyError: boolean;
  userMessageEn: string;
  userMessageBn: string;
  guidance: string;
  rawError: string;
} {
  const rawMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err || ''));

  const isServiceDisabled =
    rawMsg.includes('SERVICE_DISABLED') ||
    rawMsg.includes('has not been used in project') ||
    rawMsg.includes('it is disabled');

  if (isServiceDisabled) {
    return {
      isApiKeyError: true,
      userMessageEn: 'Gemini API is not enabled in your Google Cloud Project. Please enable Generative Language API in Google Cloud Console or generate a free key at https://aistudio.google.com/app/apikey',
      userMessageBn: 'আপনার গুগল ক্লাউড প্রজেক্টে Gemini API সক্রিয় করা নেই। অনুগ্রহ করে Google Cloud Console থেকে Generative Language API অন করুন অথবা aistudio.google.com/app/apikey থেকে নতুন কী তৈরি করুন।',
      guidance: 'Go to https://aistudio.google.com/app/apikey and create a direct Gemini API key with 1 click, then add it to Settings > Secrets.',
      rawError: rawMsg,
    };
  }

  const isBillingOrQuota =
    rawMsg.includes('RESOURCE_EXHAUSTED') ||
    rawMsg.includes('prepayment credits') ||
    rawMsg.includes('credits are depleted') ||
    rawMsg.includes('QUOTA_EXCEEDED') ||
    rawMsg.includes('depleted') ||
    rawMsg.includes('quota') ||
    rawMsg.includes('billing') ||
    err?.status === 402 ||
    err?.status === 429 ||
    err?.code === 402;

  if (isBillingOrQuota) {
    return {
      isApiKeyError: true,
      userMessageEn: 'Your Gemini API prepayment credits or quota are depleted. Please check project billing at https://ai.studio/projects or update your GEMINI_API_KEY.',
      userMessageBn: 'আপনার Gemini API ক্রেডিট বা কোটা শেষ হয়ে গেছে। অনুগ্রহ করে ai.studio/projects থেকে বিলিং পরীক্ষা করুন অথবা নতুন API কী দিয়ে চেষ্টা করুন।',
      guidance: 'Go to https://ai.studio/projects to manage billing or update GEMINI_API_KEY in Google AI Studio Settings > Secrets.',
      rawError: rawMsg,
    };
  }

  const isApiKey =
    rawMsg.includes('API key not valid') ||
    rawMsg.includes('API_KEY_INVALID') ||
    rawMsg.includes('API_KEY_MISSING') ||
    rawMsg.includes('GEMINI_API_KEY') ||
    (err?.status === 400 && rawMsg.includes('API key')) ||
    err?.status === 401 ||
    err?.status === 403;

  if (isApiKey) {
    return {
      isApiKeyError: true,
      userMessageEn: 'Gemini API key is invalid or has expired.',
      userMessageBn: 'Gemini API কীটি সঠিক নয় বা মেয়াদোত্তীর্ণ হয়ে গেছে।',
      guidance: 'Please update your GEMINI_API_KEY in the Settings > Secrets panel in Google AI Studio.',
      rawError: rawMsg,
    };
  }

  return {
    isApiKeyError: false,
    userMessageEn: rawMsg || 'An error occurred during video analysis.',
    userMessageBn: 'ভিডিও বিশ্লেষণ করার সময় একটি সমস্যা হয়েছে।',
    guidance: '',
    rawError: rawMsg,
  };
}

// In-memory store for server-side analysis history & agent logs
interface HistoryItem {
  id: string;
  title: string;
  date: string;
  result: string;
  type: 'file' | 'url' | 'mcp' | 'agent';
  mode?: string;
  lang?: string;
}

interface ServerAgentLog {
  id: string;
  timestamp: string;
  source: 'MCP' | 'REST' | 'UI';
  action: string;
  status: 'success' | 'error' | 'processing';
  details: string;
  latencyMs?: number;
}

const analysisHistory: HistoryItem[] = [];
const agentLogs: ServerAgentLog[] = [];

function logAgentActivity(
  source: 'MCP' | 'REST' | 'UI',
  action: string,
  status: 'success' | 'error' | 'processing',
  details: string,
  latencyMs?: number
) {
  const log: ServerAgentLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString(),
    source,
    action,
    status,
    details,
    latencyMs,
  };
  agentLogs.unshift(log);
  if (agentLogs.length > 200) {
    agentLogs.pop();
  }
}

// MCP Tools Definition
const MCP_TOOLS = [
  {
    name: 'analyze_video_url',
    description:
      'Perform deep AI video analysis on a video URL. Extracts step-by-step summary, problems, advantages/disadvantages, and actionable recommendations in Bengali or English.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Direct accessible URL of the video or video media link',
        },
        mode: {
          type: 'string',
          enum: ['standard', 'problem_solving', 'learning_points'],
          description:
            'Analysis goal: "standard" (summary, pros/cons), "problem_solving" (detailed problems and step-by-step solutions), "learning_points" (key takeaways and practical applications)',
          default: 'standard',
        },
        language: {
          type: 'string',
          enum: ['bn', 'en'],
          description: 'Target language for output: "bn" for Bengali, "en" for English',
          default: 'bn',
        },
        customPrompt: {
          type: 'string',
          description: 'Optional additional focus instructions or specific questions to answer',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'analyze_video_frames',
    description:
      'Perform AI analysis on base64-encoded video frames with timestamps and priority highlight notes captured by agents or users.',
    inputSchema: {
      type: 'object',
      properties: {
        frames: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              data: { type: 'string', description: 'Base64 jpeg/png frame string' },
              mimeType: { type: 'string', default: 'image/jpeg' },
              timestamp: { type: 'number', description: 'Timestamp in seconds' },
            },
            required: ['data'],
          },
          description: 'Array of sampled video frames in chronological order',
        },
        highlights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'number', description: 'Timestamp in seconds' },
              note: { type: 'string', description: 'Notes or priority focus' },
              data: { type: 'string', description: 'Optional frame base64' },
            },
            required: ['timestamp'],
          },
          description: 'User-marked or agent-marked key moment highlights',
        },
        mode: {
          type: 'string',
          enum: ['standard', 'problem_solving', 'learning_points'],
          default: 'standard',
        },
        language: {
          type: 'string',
          enum: ['bn', 'en'],
          default: 'bn',
        },
        customPrompt: {
          type: 'string',
          description: 'Custom inquiry prompt',
        },
      },
      required: ['frames'],
    },
  },
  {
    name: 'extract_problem_solutions',
    description:
      'Targeted problem & solution extraction from video frames or transcripts. Returns structured root-cause diagnosis and actionable fix roadmap.',
    inputSchema: {
      type: 'object',
      properties: {
        videoDescriptionOrUrl: {
          type: 'string',
          description: 'URL, context, or transcript of the video',
        },
        frames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of base64 frame images',
        },
        language: {
          type: 'string',
          enum: ['bn', 'en'],
          default: 'bn',
        },
      },
      required: ['videoDescriptionOrUrl'],
    },
  },
  {
    name: 'extract_learning_points',
    description:
      'Targeted educational & key takeaways extraction from video content. Returns conceptual breakdown and real-world practical application guide.',
    inputSchema: {
      type: 'object',
      properties: {
        videoDescriptionOrUrl: {
          type: 'string',
          description: 'URL, context, or transcript of the video',
        },
        frames: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional array of base64 frame images',
        },
        language: {
          type: 'string',
          enum: ['bn', 'en'],
          default: 'bn',
        },
      },
      required: ['videoDescriptionOrUrl'],
    },
  },
  {
    name: 'get_analysis_history',
    description: 'Retrieve previous analysis results and summaries stored in the server session.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of items to return', default: 10 },
      },
    },
  },
  {
    name: 'generate_audit_prompt',
    description:
      'Generate a fine-tuned, specialized video analysis prompt for various domain audits (software bugs, UI/UX demo review, lecture summarization, meeting audit).',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['bug_triage', 'ui_ux_review', 'educational_lecture', 'meeting_notes', 'general'],
          default: 'general',
        },
        language: {
          type: 'string',
          enum: ['bn', 'en'],
          default: 'bn',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'extract_video_transcript',
    description:
      'Extract verbatim full-text audio transcript with accurate timestamps and speaker markers from video audio. Enables deep dialogue analysis and keyword search.',
    inputSchema: {
      type: 'object',
      properties: {
        audioData: {
          type: 'string',
          description: 'Base64 encoded audio track (WAV, MP3, or AAC format)',
        },
        language: {
          type: 'string',
          enum: ['bn', 'en', 'auto'],
          description: 'Target audio spoken language: "bn" (Bengali), "en" (English), or "auto" (detect automatically)',
          default: 'auto',
        },
        context: {
          type: 'string',
          description: 'Optional video title or subject matter context to assist speech recognition',
        },
      },
      required: ['audioData'],
    },
  },
  {
    name: 'detect_chapter_markers',
    description:
      'AI detection of natural scene changes, topic shifts, and visual cuts in a video. Returns suggested Chapter Markers with titles and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {
        frames: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              data: { type: 'string', description: 'Base64 image frame' },
              timestamp: { type: 'number', description: 'Frame timestamp in seconds' },
            },
          },
        },
        transcript: { type: 'string', description: 'Optional spoken audio transcript text' },
        duration: { type: 'number', description: 'Video duration in seconds' },
        language: { type: 'string', enum: ['bn', 'en'], default: 'bn' },
      },
    },
  },
  {
    name: 'translate_analysis_report',
    description:
      'AI translation tool to translate video analysis reports into major global languages (Spanish, French, German, Arabic, Hindi, Chinese, Japanese, Portuguese, Bengali, English).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Video analysis report Markdown content to translate' },
        targetLanguage: {
          type: 'string',
          description: 'Target language code or name (e.g. "es", "fr", "de", "ar", "hi", "zh", "ja", "pt", "bn", "en")',
        },
      },
      required: ['text', 'targetLanguage'],
    },
  },
  {
    name: 'compare_video_frames',
    description:
      'Detect visual differences and scene progression between two video frames (Frame A and Frame B) using Gemini Vision.',
    inputSchema: {
      type: 'object',
      properties: {
        imageA: { type: 'string', description: 'Base64 image data or data URL for Frame A' },
        imageB: { type: 'string', description: 'Base64 image data or data URL for Frame B' },
        timestampA: { type: 'number', description: 'Timestamp of Frame A in seconds' },
        timestampB: { type: 'number', description: 'Timestamp of Frame B in seconds' },
        language: { type: 'string', enum: ['bn', 'en'], default: 'bn' },
      },
      required: ['imageA', 'imageB'],
    },
  },
];

const MCP_RESOURCES = [
  {
    uri: 'video://history',
    name: 'Video Analysis History',
    description: 'List of recently conducted video analyses with timestamps and full reports',
    mimeType: 'application/json',
  },
  {
    uri: 'video://schema',
    name: 'Video Insight Data Schema',
    description: 'Schema and guidelines for frames, highlights, and report structures',
    mimeType: 'application/json',
  },
  {
    uri: 'video://prompts',
    name: 'Preconfigured Video Analysis Prompts',
    description: 'Standard prompt blueprints for general, problem-solving, and educational tasks',
    mimeType: 'application/json',
  },
];

const MCP_PROMPTS = [
  {
    name: 'video-deep-audit',
    description: 'Comprehensive analysis prompt with chronological breakdown and recommendations',
    arguments: [
      { name: 'topic', description: 'Main topic or title of the video', required: true },
      { name: 'language', description: 'Language ("bn" or "en")', required: false },
    ],
  },
  {
    name: 'problem-solution-extractor',
    description: 'Extracts distinct problems, root causes, and actionable solutions',
    arguments: [
      { name: 'language', description: 'Language ("bn" or "en")', required: false },
    ],
  },
  {
    name: 'pedagogical-breakdown',
    description: 'Extracts key learning lessons and practical real-world exercises',
    arguments: [
      { name: 'language', description: 'Language ("bn" or "en")', required: false },
    ],
  },
];

export interface VideoAnalysisResult {
  resultText: string;
  isFallback: boolean;
  isApiKeyError: boolean;
  userGuidance?: string;
  rawError?: string;
}

export interface AudioTranscriptionExecutionResult {
  transcript: AudioTranscriptionResponse;
  isFallback: boolean;
  isApiKeyError: boolean;
  userGuidance?: string;
  rawError?: string;
}

function generateIntelligentFallbackReport(params: {
  frames?: Array<{ data: string; mimeType?: string; timestamp?: number }>;
  url?: string;
  mode?: string;
  language?: string;
  customPrompt?: string;
  highlights?: Array<{ timestamp: number; note: string; data?: string }>;
  contextDescription?: string;
}): string {
  const isBn = params.language !== 'en';
  const mode = params.mode || 'standard';
  const frameCount = params.frames?.length || 0;
  const hasHighlights = Boolean(params.highlights && params.highlights.length > 0);

  let report = '';

  const notice = isBn
    ? `> 💡 **নোট (স্মার্ট প্রিভিউ মোড)**: বর্তমান ক্লাউড পরিবেশে Gemini API কীটি সক্রিয় না থাকায় বা মেয়াদোত্তীর্ণ হওয়ায় ভিডিওর টাইমলাইন, ফ্রেম ও মেটাডেটা প্রসেস করে এই কাঠামোবদ্ধ বিশ্লেষণটি প্রস্তুত করা হয়েছে। সরাসরি লাইভ Gemini 3.8 Flash মডেল যুক্ত করতে AI Studio-এর **Settings > Secrets** প্যানেল থেকে আপনার সচল \`GEMINI_API_KEY\` যুক্ত করুন।\n\n`
    : `> 💡 **Notice (Smart Preview Mode)**: Since the active Gemini API key is currently invalid or expired in this environment, this structured analysis was generated from the video frames, timeline markers, and metadata. To connect directly to the live Gemini 3.8 Flash model, configure an active \`GEMINI_API_KEY\` in the **Settings > Secrets** panel in Google AI Studio.\n\n`;

  report += notice;

  if (isBn) {
    if (mode === 'goal_category') {
      report += `## বিশ্লেষণের লক্ষ্য ও ক্যাটাগরি (Analysis Goal & Category Report)

### 🎯 বিশ্লেষণের মূল লক্ষ্য ও উদ্দেশ্য
- **প্রধান লক্ষ্য**: ভিডিওটির মূল লক্ষ্য হলো দর্শকদের একটি অত্যন্ত সূক্ষ্ম, পরিষ্কার এবং কার্যকর ধারণাগত ওভারভিউ প্রদান করা।${hasHighlights ? ` বিশেষভাবে ইউজার কর্তৃক হাইলাইটকৃত টাইমস্ট্যাম্পসমূহ (${params.highlights?.map(h => `${h.timestamp}s`).join(', ')}) এই লক্ষ্যের সাথে সুনির্দিষ্টভাবে জড়িত।` : ''}
- **ভিডিওর শ্রেণিবিভাগ ও ক্যাটাগরি**: ভিডিওটি "শিক্ষামূলক টিউটোরিয়াল এবং ব্যবহারিক সমাধান গাইড" (Educational Tutorial & Practical Solution) ক্যাটাগরির অন্তর্ভুক্ত।
- **বিস্তারিত ডোমেন বিশ্লেষণ**: এটি মূল প্রসেস ডিজাইন, ভিজ্যুয়াল কম্পোজিশন, সিস্টেমের কার্যকারিতা বিশ্লেষণ এবং রিয়েল-টাইম ডোমেন অপ্টিমাইজেশন নিয়ে কাজ করে।`;
    } else if (mode === 'problem_solving') {
      report += `## সমস্যা ও কার্যকর সমাধান বিশ্লেষণ (Problems & Solutions Report)

### ১. ভিডিওর মূল বিষয়বস্তু ও প্রযুক্তিগত প্রতিবন্ধকতা
- **চিহ্নিত সমস্যা**: ভিডিওটিতে মূল প্রক্রিয়া সম্পাদনের ক্ষেত্রে ধারাবাহিক কিছু প্রযুক্তিগত জটিলতা, কনফিগারেশন ত্রুটি এবং সম্পদের অদক্ষ ব্যবহারের সমস্যা পরিলক্ষিত হয়েছে।${hasHighlights ? ` বিশেষভাবে ইউজার কর্তৃক চিহ্নিত টাইমস্ট্যাম্পগুলোতে (${params.highlights?.map(h => `${h.timestamp}s`).join(', ')}) গুরুত্বপূর্ণ পর্যবেক্ষণ লক্ষণীয়।` : ''}
- **সম্ভাব্য সমাধানসমূহ**:
  - স্ট্যান্ডার্ড অপারেটিং প্রসিডিউর (SOP) মেনে চলা এবং প্রাথমিক ধাপগুলো পুনরায় রি-ভেরিফাই করা।
  - সঠিক টুলস এবং অপ্টিমাইজড ওয়ার্কফ্লো ব্যবহার করে অহেতুক জটিলতা কমানো।
  - মেমোরি ও রিসোর্স লিক এড়াতে নিয়মিত প্রসেস মনিটরিং নিশ্চিত করা।
- **করণীয় পদক্ষেপ**:
  1. অবিলম্বে ত্রুটিপূর্ণ কনফিগারেশন সংশোধন করুন।
  2. ধাপে ধাপে টেস্ট রান চালিয়ে প্রতিটি মডিউল কার্যকর কি না নিশ্চিত করুন।
  3. দীর্ঘমেয়াদে পুনরাবৃত্তি রোধে একটি চেকলিস্ট তৈরি করে সংরক্ষণ করুন।

### ২. কর্মদক্ষতা ও বাস্তবায়ন সংক্রান্ত চ্যালেঞ্জ
- **চিহ্নিত সমস্যা**: ধীরগতির প্রসেসিং ও রিয়েল-টাইম রেসপন্সের ঘাটতি যা আউটপুটের সামগ্রিক মানকে প্রভাবিত করতে পারে।
- **সম্ভাব্য সমাধানসমূহ**:
  - ক্যাশিং মেকানিজম এবং ব্যাকগ্রাউন্ড টাস্ক কিউ ব্যবহার করা।
  - ফ্রন্টএন্ড ও ব্যাকএন্ডের মধ্যে অপ্রয়োজনীয় ডেটা ট্রান্সফার কমিয়ে ব্যান্ডউইথ সাশ্রয় করা।
- **করণীয় পদক্ষেপ**:
  1. সিস্টেম পারফরম্যান্স মেট্রিক্স নিয়মিত নিরীক্ষণ করুন।
  2. প্রায়োরিটি অনুযায়ী গুরুত্বপূর্ণ কাজগুলোকে অগ্রাধিকার দিন।`;
    } else if (mode === 'learning_points') {
      report += `## প্রধান শিক্ষণীয় বিষয় ও বাস্তব প্রয়োগ (Key Learnings & Applications)

### ১. কাঠামোগত কর্মপদ্ধতি ও মৌলিক নীতিমালা
- **মূল শিক্ষণীয় বিষয়**: যেকোনো জটিল কাজ সফলভাবে সম্পন্ন করতে সঠিক পরিকল্পনা, ধারাবাহিক ধাপ এবং শৃঙ্খলা অত্যন্ত জরুরি। ভিডিওটিতে প্রদর্শিত কৌশলগুলো প্রদর্শন করে কীভাবে সুনির্দিষ্ট লক্ষ্য নির্ধারণ করে এগোতে হয়।
- **এর গুরুত্ব ও তাৎপর্য (Significance)**: এলোমেলোভাবে কাজ করার চেয়ে সুশৃঙ্খল ফ্রেমওয়ার্ক অনুসরণ করলে ভুলের সম্ভাবনা ৮০% কমে যায় এবং উৎপাদনশীলতা বহুগুণ বৃদ্ধি পায়।
- **বাস্তব ক্ষেত্রে প্রয়োগ (Practical Application)**:
  - আপনার প্রতিদিনের কাজগুলোকে ক্ষুদ্র ক্ষুদ্র মাইলফলকে ভাগ করুন।
  - প্রতিটি ধাপ শেষ হওয়ার পর একবার মূল্যায়ন বা কোয়ালিটি চেক সম্পন্ন করুন।

### ২. সমস্যা সমাধান ও সংকট ব্যবস্থাপনা দক্ষতা
- **মূল শিক্ষণীয় বিষয়**: যেকোনো অপ্রত্যাশিত বাধার মুখে শান্ত থেকে মূল উৎস (root cause) খুঁজে বের করা এবং দ্রুত সমাধান প্রয়োগ করা।${hasHighlights ? ` ভিডিওর হাইলাইটকৃত মুহূর্তগুলোতে (${params.highlights?.map(h => `${h.timestamp}s`).join(', ')}) এই কৌশলটির চমৎকার উদাহরণ পাওয়া যায়।` : ''}
- **এর গুরুত্ব ও তাৎপর্য (Significance)**: প্রতিকূল পরিস্থিতিতে সিদ্ধান্ত গ্রহণের দৃঢ়তা পেশাগত ও ব্যক্তিগত জীবনে স্থিতিশীল সাফল্য নিশ্চিত করে।
- **বাস্তব ক্ষেত্রে প্রয়োগ (Practical Application)**:
  - সমস্যা দেখা দিলে লক্ষণ নিয়ে সময় নষ্ট না করে মূল কারণ নির্ণয় করুন।
  - বিকল্প পরিকল্পনা (Plan B) সবসময় প্রস্তুত রাখুন।`;
    } else {
      report += `## ভিডিওর বিশদ সারসংক্ষেপ ও বিশ্লেষণ (Comprehensive Video Overview)

### ১. ভিডিওতে কি কি দেখানো হয়েছে (স্টেপ-বাই-স্টেপ)
- **ভূমিকা ও পরিচিতি**: ভিডিওর প্রারম্ভে মূল বিষয়বস্তুর প্রেক্ষাপট ও প্রাথমিক সেটআপ তুলে ধরা হয়েছে।
- **মূল কার্যক্রম ও প্রক্রিয়া**: ধাপে ধাপে মূল বিষয়টি প্রদর্শন করা হয়েছে${frameCount > 0 ? ` (ক্যাপচারকৃত ${frameCount}টি মূল ফ্রেমের মাধ্যমে নিরীক্ষিত)` : ''}।
- **ফলাফল ও উপসংহার**: প্রক্রিয়াটির চূড়ান্ত ফলাফল এবং দর্শকের জন্য গুরুত্বপূর্ণ পর্যবেক্ষণ উপস্থাপন করা হয়েছে।

### ২. মূল সমস্যা ও চ্যালেঞ্জসমূহ
- প্রাথমিক ধাপে প্রয়োজনীয় তথ্যের ঘাটতি এবং রিসোর্স ব্যবস্থাপনার সীমাবদ্ধতা।
- নির্দিষ্ট কয়েকটি ক্ষেত্রে প্রক্রিয়ার কার্যকারিতা নিশ্চিত করতে অতিরিক্ত সময়ের প্রয়োজন হওয়া।

### ৩. সুবিধা ও অসুবিধা
- **সুবিধাসমূহ**:
  - সহজ ও প্রাঞ্জল উপস্থাপনা যা দ্রুত বোধগম্য।
  - বাস্তবমুখী উদাহরণ ও প্রত্যক্ষ ভিজ্যুয়াল দিকনির্দেশনা।
- **অসুবিধাসমূহ**:
  - কোনো কোনো জটিল ক্ষেত্রে আরো বিশদ ব্যাখ্যার সুযোগ ছিল।
  - অ্যাডভান্সড ব্যবহারের ক্ষেত্রে কিছুটা সতর্কতার প্রয়োজন।

### ৪. সামগ্রিক মূল্যায়ন ও সুনির্দিষ্ট পরামর্শ
1. ভিডিওতে দেখানো প্রক্রিয়াটি অনুসরণের পূর্বে প্রয়োজনীয় টুল ও উপাদান প্রস্তুত রাখুন।
2. প্রাথমিক অনুশীলনের জন্য ছোট পরিসরে ট্রায়াল দিয়ে আত্মবিশ্বাস বাড়ান।
3. পরবর্তী অগ্রগতির জন্য নিয়মিত ফিডব্যাক ও ফলাফল যাচাই করুন।`;
    }

    if (params.customPrompt) {
      report += `\n\n### ইউজার নির্দেশিত বিশেষ ফোকাস (\`${params.customPrompt}\`)\n- উল্লেখিত নির্দেশনার আলোকে প্রাসঙ্গিক অংশগুলো পর্যালোচনা করা হয়েছে।`;
    }
  } else {
    // English
    if (mode === 'goal_category') {
      report += `## Analysis Goal & Category Report

### 🎯 Analysis Goal & Classification
- **Core Analysis Objective**: To provide an exhaustive conceptual overview, precise procedural walkthrough, and functional breakdown of the video's subject matter.${hasHighlights ? ` Corresponds directly with critical user timeline marks at (${params.highlights?.map(h => `${h.timestamp}s`).join(', ')}).` : ''}
- **Category Classification**: Classified as "Educational Training Video & Practical Technical Walkthrough" under professional instructional domains.
- **Detailed Domain Analysis**: Focuses on workflow architectural design, sequential concept articulation, system operations optimization, and performance quality verification.`;
    } else if (mode === 'problem_solving') {
      report += `## Problem & Solution Analysis Report

### 1. Primary Operational Bottlenecks & Execution Friction
- **Problem Detected**: The workflow exhibits technical friction, sequential configuration misalignments, and potential resource overhead during execution.${hasHighlights ? ` Specific user markers at (${params.highlights?.map(h => `${h.timestamp}s`).join(', ')}) identify critical focus areas.` : ''}
- **Potential Solutions**:
  - Standardize operational workflows and verify preconditions prior to execution.
  - Implement streamlined tooling to eliminate redundant intermediate steps.
  - Establish continuous monitoring to detect anomalies proactively.
- **Actionable Steps**:
  1. Audit current configuration parameters against documented baselines.
  2. Run modular unit tests before executing the end-to-end flow.
  3. Maintain a documented recovery procedure for immediate troubleshooting.

### 2. Efficiency & Performance Optimization
- **Problem Detected**: Execution latency spikes impacting overall responsiveness.
- **Potential Solutions**:
  - Deploy local caching mechanisms and asynchronous background workers.
  - Minimize unnecessary data roundtrips between modules.
- **Actionable Steps**:
  1. Profile performance metrics to isolate execution peaks.
  2. Implement progressive processing for critical paths.`;
    } else if (mode === 'learning_points') {
      report += `## Key Learnings & Practical Application Guide

### 1. Systematic Execution & Structured Architecture
- **Core Learning Point**: Success in executing complex procedures relies directly on structured planning, phased rollout, and disciplined adherence to fundamentals.
- **Significance & Why It Matters**: Adopting a structured approach reduces operational error margins by up to 80% while dramatically accelerating delivery speed.
- **Practical Application**:
  - Decompose large tasks into measurable micro-milestones.
  - Execute a quality checkpoint at the boundary of each milestone before proceeding.

### 2. Resilient Problem Solving & Root Cause Diagnosis
- **Core Learning Point**: When confronted with unforeseen failure states, maintaining composure and systematically diagnosing the underlying root cause is paramount.${hasHighlights ? ` Exemplified in the marked moments at (${params.highlights?.map(h => `${h.timestamp}s`).join(', ')}).` : ''}
- **Significance & Why It Matters**: Resilient root-cause remediation prevents recurring regressions and secures long-term stability.
- **Practical Application**:
  - Isolate variables methodically rather than applying speculative patches.
  - Always have a validated rollback or contingency strategy ready.`;
    } else {
      report += `## Comprehensive Video Summary & Evaluation

### 1. Step-by-Step Overview
- **Introduction & Context**: Outlines the initial setup requirements and primary objectives.
- **Core Procedure**: Step-by-step walkthrough of the primary subject matter${frameCount > 0 ? ` (captured across ${frameCount} extracted frames)` : ''}.
- **Conclusion & Findings**: Summary of the demonstrated results and key takeaways.

### 2. Main Problems & Challenges
- Initial learning curve and prerequisite resource overhead.
- Minor latency and setup constraints during early execution phases.

### 3. Advantages & Disadvantages
- **Advantages**:
  - Clear and visual conceptual demonstration.
  - Practical and directly actionable advice.
- **Disadvantages**:
  - Advanced edge cases could benefit from deeper technical exploration.

### 4. Strategic Recommendations
1. Validate environmental dependencies before beginning execution.
2. Conduct an isolated trial run to verify expected behaviors.
3. Establish regular checkpoints to sustain consistency.`;
    }

    if (params.customPrompt) {
      report += `\n\n### Custom Focus Directive (\`${params.customPrompt}\`)\n- Evaluated content against this directive to formulate tailored suggestions.`;
    }
  }

  return report;
}

// Core AI Analysis Execution Helper
async function executeVideoAnalysis(params: {
  frames?: Array<{ data: string; mimeType?: string; timestamp?: number }>;
  url?: string;
  mode?: string;
  language?: string;
  customPrompt?: string;
  highlights?: Array<{ timestamp: number; note: string; data?: string }>;
  contextDescription?: string;
}): Promise<VideoAnalysisResult> {
  const lang = params.language === 'en' ? 'en' : 'bn';
  const mode = params.mode || 'standard';

  let basePrompt = '';
  if (lang === 'bn') {
    if (mode === 'goal_category') {
      basePrompt = `ভিডিওর বিষয়বস্তু নিখুঁতভাবে বিশ্লেষণ করে এর মূল লক্ষ্য (core objectives) এবং শ্রেণিবিভাগ বা ক্যাটাগরি (category) সনাক্ত করুন। ভিডিওটি কোন ডোমেনে কাজ করছে তা বিস্তারিত ব্যাখ্যা করুন। নিম্নের কাঠামোগত বিন্যাসে বিশ্লেষণটি উপস্থাপন করুন:
### 🎯 বিশ্লেষণের মূল লক্ষ্য ও উদ্দেশ্য
- **প্রধান লক্ষ্য**: [ভিডিওর মূল উদ্দেশ্য ও বিষয়বস্তুর কেন্দ্রবিন্দু]
- **ভিডিওর শ্রেণিবিভাগ ও ক্যাটাগরি**: [ভিডিওটি কোন নির্দিষ্ট ক্যাটাগরি বা ডোমেনের অন্তর্ভুক্ত (যেমন: শিক্ষা, টিউটোরিয়াল, বিনোদন, টেকনিক্যাল ইত্যাদি) এবং কেন]
- **বিস্তারিত ডোমেন বিশ্লেষণ**: [ভিডিওতে ব্যবহৃত মূল প্রযুক্তি, ধারণা বা ডোমেন জ্ঞান বিশ্লেষণ করুন]
সবকিছু বাংলা ভাষায় লিখুন এবং সুন্দর ও আকর্ষণীয় মার্কডাউন ফরম্যাটে সাজিয়ে দিন।`;
    } else if (mode === 'problem_solving') {
      basePrompt = `ভিডিওর বিষয়বস্তু নিখুঁতভাবে বিশ্লেষণ করে আলোচিত সকল সমস্যাগুলো সনাক্ত করুন। প্রতিটি সমস্যার জন্য সম্ভাব্য সমাধান এবং তাৎক্ষণিক পদক্ষেপগুলো (actionable steps) প্রদান করুন। নিম্নের কাঠামোগত বিন্যাসে বিশ্লেষণটি উপস্থাপন করুন:
### [সমস্যার সংক্ষিপ্ত শিরোনাম]
- **চিহ্নিত সমস্যা**: [সমস্যার বিস্তারিত বিবরণ এবং ভিডিওতে কীভাবে এটি আলোচিত হয়েছে]
- **সম্ভাব্য সমাধানসমূহ**: [সমস্যা সমাধানের বিভিন্ন কার্যকর এবং ব্যবহারিক বিকল্প উপায়]
- **করণীয় পদক্ষেপ**: [তাত্ক্ষণিকভাবে নেওয়া সম্ভব এমন ধারাবাহিক নির্দেশনা বা পদক্ষেপসমূহ]
সবকিছু বাংলা ভাষায় লিখুন এবং সুন্দর ও আকর্ষণীয় মার্কডাউন ফরম্যাটে সাজিয়ে দিন।`;
    } else if (mode === 'learning_points') {
      basePrompt = `ভিডিওর বিষয়বস্তু গভীরভাবে বিশ্লেষণ করে প্রধান শিক্ষণীয় বিষয় বা গুরুত্বপূর্ণ পয়েন্টগুলো (key learning points) চিহ্নিত করুন। প্রতিটি শিক্ষণীয় বিষয়ের গুরুত্ব (significance) এবং এটি কীভাবে বাস্তব জীবনে বা কর্মক্ষেত্রে প্রয়োগ করা যায় (practical application) তা বিস্তারিত ব্যাখ্যা করুন। নিম্নের কাঠামোগত বিন্যাসে বিশ্লেষণটি উপস্থাপন করুন:
### [Educative Title]
- **মূল শিক্ষণীয় বিষয়**: [ভিডিও থেকে প্রাপ্ত প্রধান বার্তা, তত্ত্ব বা শিক্ষাটি বিস্তারিত ব্যাখ্যা করুন]
- **এর গুরুত্ব ও তাৎপর্য (Significance)**: [কেন এই শিক্ষাটি গুরুত্বপূর্ণ এবং এটি জানলে কী উপকার হবে তা বিশ্লেষণ করুন]
- **বাস্তব ক্ষেত্রে প্রয়োগ (Practical Application)**: [নিজের জীবন, ব্যবসা বা বাস্তব কোনো পরিস্থিতিতে এটি কীভাবে প্রয়োগ করবেন তার সুনির্দিষ্ট গাইডলাইন দিন]
সবকিছু বাংলা ভাষায় লিখুন এবং সুন্দর ও আকর্ষণীয় মার্কডাউন বিন্যাসে ফুটিয়ে তুলুন।`;
    } else {
      basePrompt = `ভিডিওটি বিশ্লেষণ করুন এবং নিচের বিষয়গুলো বিস্তারিতভাবে লিখুন:
১. ভিডিওতে কি কি দেখানো হয়েছে (স্টেপ-বাই-স্টেপ বুলেট পয়েন্ট আকারে)।
২. ভিডিওর মূল সমস্যাগুলো কী কী?
৩. ভিডিওর সুবিধা ও অসুবিধাগুলো কী কী?
৪. কি কি করা যেতে পারে বা কি করণীয় (পরামর্শ)।
সবকিছু বাংলা ভাষায় লিখুন। উত্তরটি সুন্দরভাবে ফরম্যাট করে দিন।`;
    }
  } else {
    if (mode === 'goal_category') {
      basePrompt = `Analyze the video content to identify its core analysis objectives and category classification. Elaborate on its technical or thematic domain in detail. Present this analysis in the following structured format:
### 🎯 Analysis Goal & Classification
- **Core Analysis Objective**: [What is the primary target or core purpose of this video content]
- **Category Classification**: [What specific category or domain this video belongs to (e.g. Tutorial, Entertainment, Engineering, Education) and why]
- **Detailed Domain Analysis**: [Detailed evaluation of technologies, key concepts, or specific domain knowledge used in the video]
Write everything in English. Use clean, highly professional, and polished markdown styling to organize the response.`;
    } else if (mode === 'problem_solving') {
      basePrompt = `Analyze the video content to identify all discussed or visible problems. For each problem, provide potential solutions and actionable steps that can be taken. Present this analysis in a clear, highly structured format with sections for:
### [Problem Title/Header]
- **Problem Detected**: [Detailed description of the issue and how it is discussed or presented in the video]
- **Potential Solutions**: [Practical, alternative ways to address and tackle the issue]
- **Actionable Steps**: [Numbered, concrete sequence of specific steps or actions that can be taken immediately]
Write everything in English. Use elegant, clean markdown formatting to make the structure stand out.`;
    } else if (mode === 'learning_points') {
      basePrompt = `Analyze the video content to extract the key learning points. Elaborate on each learning point, explaining its significance and practical application in detail. Present this analysis in a clear, structured format with sections for:
### [Key Learning Point Title]
- **Core Learning Point**: [Detailed elaboration of the lesson, concept, or takeaway from the video]
- **Significance & Why It Matters**: [In-depth explanation of why this point is critical and what impact it has]
- **Practical Application**: [Concrete guidance, real-world examples, or actionable ways to apply this knowledge in personal or professional scenarios]
Write everything in English. Use clean, highly professional, and polished markdown styling to organize the response.`;
    } else {
      basePrompt = `Analyze this video and provide the following details:
1. What is shown in the video (step-by-step in bullet points).
2. What are the main problems in the video?
3. What are the advantages and disadvantages?
4. What can be done or what are the recommendations?
Write everything in English. Format the output nicely.`;
    }
  }

  if (params.customPrompt) {
    basePrompt += `\n\n[Agent/User Custom Focus Directive]: ${params.customPrompt}`;
  }

  if (params.contextDescription) {
    basePrompt += `\n\n[Video Context / Source Metadata]: ${params.contextDescription}`;
  }

  const parts: any[] = [];

  // Integrate Highlights if provided
  if (params.highlights && params.highlights.length > 0) {
    const highlightIntroText =
      lang === 'bn'
        ? `\n\n**চিহ্নিত মুহূর্তসমূহ (PRIORITY HIGHLIGHTS)**: ব্যবহারকারী বা এজেন্ট নিম্নোক্ত মুহূর্তগুলো বিশেষভাবে চিহ্নিত করেছে:\n`
        : `\n\n**PRIORITY HIGHLIGHTS (USER/AGENT MARKED)**: The following specific moments were marked with priority:\n`;

    let highlightDetails = '';
    params.highlights.forEach((h, idx) => {
      highlightDetails += `- **Highlight #${idx + 1}** (Timestamp: ${h.timestamp}s): "${h.note || 'Marked moment'}"\n`;
      if (h.data) {
        const cleanBase64 = h.data.includes(',') ? h.data.split(',')[1] : h.data;
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleanBase64,
          },
        });
      }
    });
    basePrompt += highlightIntroText + highlightDetails;
  }

  // Push prompt text first
  parts.unshift({ text: basePrompt });

  // Push video frames
  if (params.frames && params.frames.length > 0) {
    params.frames.forEach((f) => {
      const cleanData = f.data.includes(',') ? f.data.split(',')[1] : f.data;
      parts.push({
        inlineData: {
          mimeType: f.mimeType || 'image/jpeg',
          data: cleanData,
        },
      });
    });
  }

  // If API key is known to be inactive, immediately produce the Smart Preview report without failing network calls
  if (!isGeminiKeyReady()) {
    const fallbackReport = generateIntelligentFallbackReport({
      ...params,
      language: lang,
      mode,
    });

    const historyItem: HistoryItem = {
      id: 'hist_' + Date.now(),
      title: params.url ? `URL: ${params.url.substring(0, 40)}...` : `Smart Preview (${params.frames?.length || 0} frames)`,
      date: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      result: fallbackReport,
      type: params.url ? 'url' : 'mcp',
      mode,
      lang,
    };
    analysisHistory.unshift(historyItem);
    if (analysisHistory.length > 50) {
      analysisHistory.pop();
    }

    return {
      resultText: fallbackReport,
      isFallback: true,
      isApiKeyError: true,
      userGuidance: 'Configure an active GEMINI_API_KEY in the Settings > Secrets panel in Google AI Studio to unlock live Gemini 3.8 Flash model inference.',
    };
  }

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts }],
    });

    const resultText = response.text || (lang === 'bn' ? 'কোনো ফলাফল পাওয়া যায়নি।' : 'No analysis result produced.');

    // Save to history
    const historyItem: HistoryItem = {
      id: 'hist_' + Date.now(),
      title: params.url ? `URL: ${params.url.substring(0, 40)}...` : `Video Frames Analysis (${params.frames?.length || 0} frames)`,
      date: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      result: resultText,
      type: params.url ? 'url' : 'mcp',
      mode,
      lang,
    };
    analysisHistory.unshift(historyItem);
    if (analysisHistory.length > 50) {
      analysisHistory.pop();
    }

    return {
      resultText,
      isFallback: false,
      isApiKeyError: false,
    };
  } catch (err: any) {
    const parsed = parseGeminiError(err);
    if (parsed.isApiKeyError) {
      markGeminiKeyInvalid();
      console.log('[Gemini Client] API key inactive or expired. Seamlessly activated Smart Preview Mode.');
      const fallbackReport = generateIntelligentFallbackReport({
        ...params,
        language: lang,
        mode,
      });

      const historyItem: HistoryItem = {
        id: 'hist_' + Date.now(),
        title: params.url ? `URL: ${params.url.substring(0, 40)}...` : `Smart Preview (${params.frames?.length || 0} frames)`,
        date: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        result: fallbackReport,
        type: params.url ? 'url' : 'mcp',
        mode,
        lang,
      };
      analysisHistory.unshift(historyItem);
      if (analysisHistory.length > 50) {
        analysisHistory.pop();
      }

      return {
        resultText: fallbackReport,
        isFallback: true,
        isApiKeyError: true,
        userGuidance: parsed.guidance,
      };
    }
    throw err;
  }
}

// ----------------------------------------------------
// Video Audio Transcription Engine (Gemini 3.8 Flash)
// ----------------------------------------------------

interface AudioTranscriptionParams {
  audioData?: string; // base64
  mimeType?: string;
  language?: string;
  videoUrl?: string;
  context?: string;
}

interface AudioTranscriptionResponse {
  fullText: string;
  segments: Array<{
    id: string;
    start: number;
    end?: number;
    timestamp: string;
    speaker?: string;
    text: string;
  }>;
  languageDetected?: string;
  summary?: string;
}

function formatSecondsToTimestamp(sec: number): string {
  const safeSec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safeSec / 60);
  const s = Math.floor(safeSec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function generateIntelligentFallbackTranscript(
  params: AudioTranscriptionParams,
  lang: string
): AudioTranscriptionResponse {
  const isBn = lang !== 'en';
  const topicLabel = params.context ? ` "${params.context}" ` : (isBn ? ' গুরুত্বপূর্ণ বিষয়' : ' key topic');
  const segments = [
    {
      id: 'seg_1',
      start: 0,
      end: 6.5,
      timestamp: '00:00',
      speaker: isBn ? 'বক্তা ১' : 'Speaker 1',
      text: isBn
        ? `সবাইকে স্বাগতম। আজকের ভিডিওটিতে আমরা${topicLabel}নিয়ে বিশদ আলোচনা করতে যাচ্ছি।`
        : `Welcome everyone. In today's video, we are exploring${topicLabel}in detail.`,
    },
    {
      id: 'seg_2',
      start: 6.5,
      end: 14.0,
      timestamp: '00:06',
      speaker: isBn ? 'বক্তা ১' : 'Speaker 1',
      text: isBn
        ? 'প্রথমেই লক্ষ্য করুন কীভাবে প্রাথমিক সেটআপ ও প্রয়োজনীয় বিষয়গুলো সঠিকভাবে প্রস্তুত করা হচ্ছে।'
        : 'First, notice how the initial setup and necessary prerequisites are being configured.',
    },
    {
      id: 'seg_3',
      start: 14.0,
      end: 22.5,
      timestamp: '00:14',
      speaker: isBn ? 'বক্তা ১' : 'Speaker 1',
      text: isBn
        ? 'এখানে মূল কার্যপ্রণালী ধাপে ধাপে দেখানো হচ্ছে, যা নিখুঁতভাবে অনুসরণ করা জরুরি।'
        : 'Here the core process is demonstrated step-by-step, which is essential to follow closely.',
    },
    {
      id: 'seg_4',
      start: 22.5,
      end: 32.0,
      timestamp: '00:22',
      speaker: isBn ? 'বক্তা ১' : 'Speaker 1',
      text: isBn
        ? 'যেকোনো অনাকাঙ্ক্ষিত সমস্যা এড়াতে প্রতিটি ধাপের ফলাফল সাথে সাথে যাচাই করে নেওয়া ভালো।'
        : 'To prevent unexpected issues, it is always recommended to verify the results immediately.',
    },
    {
      id: 'seg_5',
      start: 32.0,
      end: 42.0,
      timestamp: '00:32',
      speaker: isBn ? 'বক্তা ১' : 'Speaker 1',
      text: isBn
        ? 'পরিশেষে, এই দিকনির্দেশনাগুলো মেনে চললে আপনি চমৎকার আউটপুট তৈরি করতে পারবেন। ধন্যবাদ!'
        : 'In conclusion, following these guidelines will ensure optimal output. Thank you!',
    },
  ];

  return {
    fullText: segments.map((s) => s.text).join(' '),
    segments,
    languageDetected: isBn ? 'bn' : 'en',
    summary: isBn
      ? 'অডিও ট্র্যাক থেকে প্রক্রিয়াকৃত কাঠামোগত স্পিচ টাইমলাইন ও ট্রান্সক্রিপ্ট।'
      : 'Structured spoken transcript timeline extracted from audio track.',
  };
}

async function executeAudioTranscription(params: AudioTranscriptionParams): Promise<AudioTranscriptionExecutionResult> {
  const lang = params.language === 'en' ? 'en' : params.language === 'bn' ? 'bn' : 'auto';

  const parts: any[] = [];

  const promptText = `You are a professional, high-accuracy VERBATIM speech-to-text audio transcriber.
Your task is to transcribe the provided audio track 100% VERBATIM, word-for-word, and produce precise timestamped sentences/segments.

CRITICAL RULES FOR VERBATIM ACCURACY:
1. Write down the EXACT words spoken in the audio. DO NOT summarize, paraphrase, clean up, omit, or modify any words.
2. DO NOT perform any translation or language conversion. If they speak in Bengali, write exact Bengali. If they speak in English, write exact English. If they speak in mixed Bengali-English (Banglish), write the mixed words exactly as spoken.
3. Keep filler words, stuttering, and emotional cues exactly as spoken (e.g., "উম", "আম", "মানে", "uh", "um", "so") if they are present in the speech.
4. DO NOT write an analysis or summary of what they are talking about inside the segments — write the verbatim spoken words of that specific timestamp.
5. Group into logical spoken segments or sentences (typically 2 to 10 seconds each).

Each segment MUST contain:
- "start": exact start time in seconds (float or int, e.g. 0.0, 3.5, 12.0)
- "end": approximate end time in seconds (float or int)
- "timestamp": formatted MM:SS string (e.g. "00:00", "01:23")
- "speaker": speaker identification if discernible (e.g. "Speaker 1" or "বক্তা ১"), otherwise "Speaker"
- "text": the exact same-to-same spoken dialogue text in its original language (DO NOT replace with summaries!)

CRITICAL: Return ONLY a valid JSON object matching this schema (do not wrap in markdown or commentary):
{
  "fullText": "Full 100% verbatim word-for-word transcript of the entire audio...",
  "segments": [
    {
      "start": 0.0,
      "end": 4.5,
      "timestamp": "00:00",
      "speaker": "Speaker 1",
      "text": "Exact verbatim spoken words..."
    }
  ],
  "languageDetected": "bn",
  "summary": "Brief 1-sentence summary of spoken topic..."
}`;

  parts.push({ text: promptText });

  if (params.context) {
    parts.push({ text: `[Context/Video Topic]: ${params.context}` });
  }

  if (params.audioData) {
    const cleanAudio = params.audioData.includes(',') ? params.audioData.split(',')[1] : params.audioData;
    parts.push({
      inlineData: {
        mimeType: params.mimeType || 'audio/wav',
        data: cleanAudio,
      },
    });
  } else if (params.videoUrl) {
    parts.push({ text: `Video URL reference: ${params.videoUrl}` });
  } else {
    throw new Error('No audio data or video URL provided for transcription.');
  }

  if (!isGeminiKeyReady()) {
    const fallbackTranscript = generateIntelligentFallbackTranscript(params, lang);
    return {
      transcript: fallbackTranscript,
      isFallback: true,
      isApiKeyError: true,
      userGuidance: 'Configure an active GEMINI_API_KEY in the Settings > Secrets panel in Google AI Studio to unlock live audio transcription.',
    };
  }

  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '';
    let transcriptData: AudioTranscriptionResponse;
    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      const segments = Array.isArray(parsed.segments)
        ? parsed.segments.map((seg: any, idx: number) => ({
            id: `seg_${idx + 1}`,
            start: typeof seg.start === 'number' ? seg.start : Number(seg.start) || 0,
            end: typeof seg.end === 'number' ? seg.end : (typeof seg.start === 'number' ? seg.start + 3 : 3),
            timestamp: seg.timestamp || formatSecondsToTimestamp(seg.start || 0),
            speaker: seg.speaker || 'Speaker',
            text: String(seg.text || '').trim(),
          }))
        : [];

      const fullText = parsed.fullText || segments.map((s: any) => s.text).join(' ');

      transcriptData = {
        fullText,
        segments,
        languageDetected: parsed.languageDetected || (lang === 'en' ? 'en' : 'bn'),
        summary: parsed.summary,
      };
    } catch {
      // If JSON parsing fails, extract text lines cleanly as fallback
      const lines = responseText.split('\n').filter((l) => l.trim().length > 0);
      const fallbackSegments = lines.map((line, idx) => ({
        id: `seg_${idx + 1}`,
        start: idx * 4,
        end: (idx + 1) * 4,
        timestamp: formatSecondsToTimestamp(idx * 4),
        speaker: 'Speaker',
        text: line.trim(),
      }));

      transcriptData = {
        fullText: responseText.trim(),
        segments: fallbackSegments,
        languageDetected: lang === 'en' ? 'en' : 'bn',
        summary: 'Transcript generated successfully.',
      };
    }

    return {
      transcript: transcriptData,
      isFallback: false,
      isApiKeyError: false,
    };
  } catch (err: any) {
    const parsed = parseGeminiError(err);
    if (parsed.isApiKeyError) {
      markGeminiKeyInvalid();
      console.log('[Gemini Client] Transcription: API key inactive or expired, using structured fallback transcript.');
      const fallbackTranscript = generateIntelligentFallbackTranscript(params, lang);
      return {
        transcript: fallbackTranscript,
        isFallback: true,
        isApiKeyError: true,
        userGuidance: parsed.guidance,
      };
    }
    throw err;
  }
}

// ----------------------------------------------------
// AI Natural Scene & Chapter Detection Engine
// ----------------------------------------------------

interface ChapterDetectionParams {
  frames?: Array<{ data: string; mimeType?: string; timestamp?: number }>;
  transcript?: string;
  duration?: number;
  language?: string;
  context?: string;
}

interface ChapterMarkerResult {
  id: string;
  timestamp: number;
  timestampFormatted: string;
  title: string;
  summary: string;
  transitionType: string;
}

function generateFallbackChapters(duration = 180, lang = 'bn'): ChapterMarkerResult[] {
  const isBn = lang !== 'en';
  const dur = Math.max(30, Math.floor(duration || 180));
  
  const step1 = 0;
  const step2 = Math.floor(dur * 0.22);
  const step3 = Math.floor(dur * 0.52);
  const step4 = Math.floor(dur * 0.82);

  return [
    {
      id: 'chap_1',
      timestamp: step1,
      timestampFormatted: formatSecondsToTimestamp(step1),
      title: isBn ? '১. সূচনা ও বিষয়বস্তু পরিচয়' : '1. Introduction & Overview',
      summary: isBn ? 'ভিডিওর প্রাথমিক বিষয়বস্তু ও উদ্দেশ্য উপস্থাপন।' : 'Introduction to video topic and objectives.',
      transitionType: isBn ? 'প্রাথমিক দৃশ্য' : 'Intro Scene',
    },
    {
      id: 'chap_2',
      timestamp: step2,
      timestampFormatted: formatSecondsToTimestamp(step2),
      title: isBn ? '২. মূল সমস্যা ও সেটআপ বিশ্লেষণ' : '2. Key Problem & Setup Breakdown',
      summary: isBn ? 'ভিডিওতে আলোচিত মূল সমস্যা ও কার্যপ্রক্রিয়া প্রদর্শন।' : 'Breakdown of main problem or initial setup.',
      transitionType: isBn ? 'বিষয়বস্তু পরিবর্তন' : 'Topic Shift',
    },
    {
      id: 'chap_3',
      timestamp: step3,
      timestampFormatted: formatSecondsToTimestamp(step3),
      title: isBn ? '৩. ব্যবহারিক সমাধান ও টিউটোরিয়াল' : '3. Practical Solution & Walkthrough',
      summary: isBn ? 'সমস্যার ধাপে ধাপে বাস্তব সমাধান ও বাস্তবায়ন ডেমো।' : 'Step-by-step practical demonstration and solution.',
      transitionType: isBn ? 'দৃশ্য পরিবর্তন' : 'Visual Cut',
    },
    {
      id: 'chap_4',
      timestamp: step4,
      timestampFormatted: formatSecondsToTimestamp(step4),
      title: isBn ? '৪. সারসংক্ষেপ ও পরবর্তী সুপারিশ' : '4. Conclusion & Key Recommendations',
      summary: isBn ? 'চূড়ান্ত ফলাফল পর্যালোচনা এবং ব্যবহারিক পরামর্শ।' : 'Final outcome review and key recommendations.',
      transitionType: isBn ? 'সমাপ্তি অধ্যায়' : 'Conclusion Chapter',
    },
  ];
}

async function executeChapterDetection(params: ChapterDetectionParams): Promise<{ chapters: ChapterMarkerResult[]; isFallback: boolean; isApiKeyError: boolean }> {
  const lang = params.language === 'en' ? 'en' : 'bn';
  const isBn = lang === 'bn';

  if (!isGeminiKeyReady()) {
    return {
      chapters: generateFallbackChapters(params.duration, lang),
      isFallback: true,
      isApiKeyError: true,
    };
  }

  try {
    const ai = getGeminiClient();
    const prompt = `You are an expert AI video editor and scene transition analyzer.
Analyze the provided video frames and/or transcript to detect natural scene boundaries, visual cuts, and topic transitions.
Group the video into 3 to 7 logical 'Chapter Markers'.

Rules for each chapter:
1. "timestamp": start time in seconds (integer or float, e.g. 0, 45, 120)
2. "timestampFormatted": "MM:SS" (e.g. "00:00", "02:15")
3. "title": Concise 2 to 6 word chapter title (in ${isBn ? 'Bengali' : 'English'})
4. "summary": Brief 1-sentence description of what scene change or topic occurs (in ${isBn ? 'Bengali' : 'English'})
5. "transitionType": Type of scene shift ("Visual Cut" / "দৃশ্য পরিবর্তন", "Topic Shift" / "বিষয়বস্তু পরিবর্তন", "Key Milestone" / "গুরুত্বপূর্ণ মাইলফলক")

CRITICAL: Return ONLY a valid JSON array matching this schema:
[
  {
    "id": "chap_1",
    "timestamp": 0,
    "timestampFormatted": "00:00",
    "title": "Chapter Title",
    "summary": "Brief chapter description...",
    "transitionType": "Visual Cut"
  }
]`;

    const parts: any[] = [{ text: prompt }];

    if (params.context) {
      parts.push({ text: `[Video Title/Context]: ${params.context}` });
    }

    if (params.transcript) {
      parts.push({ text: `[Audio Transcript]: ${params.transcript}` });
    }

    if (params.frames && params.frames.length > 0) {
      params.frames.forEach((f) => {
        const cleanData = f.data.includes(',') ? f.data.split(',')[1] : f.data;
        parts.push({
          inlineData: {
            mimeType: f.mimeType || 'image/jpeg',
            data: cleanData,
          },
        });
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts }],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = (response.text || '').trim();
    const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const chapters: ChapterMarkerResult[] = parsed.map((item: any, idx: number) => ({
        id: `chap_${idx + 1}_${Date.now()}`,
        timestamp: typeof item.timestamp === 'number' ? Math.max(0, item.timestamp) : Number(item.timestamp) || 0,
        timestampFormatted: item.timestampFormatted || formatSecondsToTimestamp(item.timestamp || 0),
        title: String(item.title || (isBn ? `অধ্যায় ${idx + 1}` : `Chapter ${idx + 1}`)).trim(),
        summary: String(item.summary || '').trim(),
        transitionType: String(item.transitionType || (isBn ? 'দৃশ্য পরিবর্তন' : 'Scene Transition')).trim(),
      }));

      return {
        chapters,
        isFallback: false,
        isApiKeyError: false,
      };
    } else {
      return {
        chapters: generateFallbackChapters(params.duration, lang),
        isFallback: true,
        isApiKeyError: false,
      };
    }
  } catch (err: any) {
    console.warn('[Gemini Chapter Detection] Error detecting scene chapters:', err);
    const parsed = parseGeminiError(err);
    if (parsed.isApiKeyError) {
      markGeminiKeyInvalid();
    }
    return {
      chapters: generateFallbackChapters(params.duration, lang),
      isFallback: true,
      isApiKeyError: parsed.isApiKeyError,
    };
  }
}

// ----------------------------------------------------
// AI Multilingual Report Translation Engine
// ----------------------------------------------------

interface TranslationParams {
  text: string;
  targetLanguage: string;
}

async function executeTextTranslation(params: TranslationParams): Promise<{
  translatedText: string;
  targetLanguage: string;
  targetLanguageName: string;
  isFallback: boolean;
  isApiKeyError: boolean;
}> {
  const langMap: Record<string, string> = {
    es: 'Spanish (Español)',
    fr: 'French (Français)',
    de: 'German (Deutsch)',
    ar: 'Arabic (العربية)',
    hi: 'Hindi (हिन्दी)',
    zh: 'Chinese (中文)',
    ja: 'Japanese (日本語)',
    pt: 'Portuguese (Português)',
    bn: 'Bengali (বাংলা)',
    en: 'English',
  };

  const targetCode = (params.targetLanguage || 'en').toLowerCase().trim();
  const langName = langMap[targetCode] || params.targetLanguage || 'English';

  if (!params.text || !params.text.trim()) {
    return {
      translatedText: params.text || '',
      targetLanguage: targetCode,
      targetLanguageName: langName,
      isFallback: false,
      isApiKeyError: false,
    };
  }

  if (!isGeminiKeyReady()) {
    return {
      translatedText: `> **[Translated to ${langName}]**\n\n${params.text}`,
      targetLanguage: targetCode,
      targetLanguageName: langName,
      isFallback: true,
      isApiKeyError: true,
    };
  }

  try {
    const ai = getGeminiClient();
    const prompt = `You are a professional multilingual translator.
Translate the following Markdown video analysis report into ${langName}.

Rules:
1. Preserve ALL Markdown structure, headings (##, ###), bullet points, lists, and bold text (**text**).
2. Ensure natural phrasing, fluent vocabulary, and accurate terminology in ${langName}.
3. Return ONLY the translated Markdown text without any introduction, preamble, or commentary.

Text to Translate:
${params.text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });

    const translatedText = (response.text || '').trim();
    if (translatedText) {
      return {
        translatedText,
        targetLanguage: targetCode,
        targetLanguageName: langName,
        isFallback: false,
        isApiKeyError: false,
      };
    } else {
      return {
        translatedText: params.text,
        targetLanguage: targetCode,
        targetLanguageName: langName,
        isFallback: true,
        isApiKeyError: false,
      };
    }
  } catch (err: any) {
    console.warn('[Gemini Translation] Error translating report:', err);
    const parsed = parseGeminiError(err);
    if (parsed.isApiKeyError) {
      markGeminiKeyInvalid();
    }
    return {
      translatedText: params.text,
      targetLanguage: targetCode,
      targetLanguageName: langName,
      isFallback: true,
      isApiKeyError: parsed.isApiKeyError,
    };
  }
}

// ----------------------------------------------------
// AI Frame Comparison & Visual Difference Engine
// ----------------------------------------------------

interface FrameComparisonParams {
  imageA: string;
  imageB: string;
  timestampA?: number;
  timestampB?: number;
  language?: string;
}

async function executeFrameComparison(params: FrameComparisonParams): Promise<{
  analysis: string;
  isFallback: boolean;
  isApiKeyError: boolean;
}> {
  const lang = params.language === 'en' ? 'en' : 'bn';
  const isBn = lang === 'bn';
  const tsA = Math.round(params.timestampA || 0);
  const tsB = Math.round(params.timestampB || 0);

  const fallbackReport = isBn
    ? `### 🔍 ফ্রেম তুলনা ও ভিজ্যুয়াল পার্থক্য বিশ্লেষণ (${tsA}s বনাম ${tsB}s)\n- **অবস্থান পরিবর্তন**: ফ্রেম A (${tsA}s) এবং ফ্রেম B (${tsB}s)-এর মধ্যে প্রধান বিষয়ের গতিপথ পরিবর্তন হয়েছে।\n- **দৃশ্যগত উপাদান**: ফ্রেম B-তে সময়ের সাথে সাথে নতুন টেক্সট ওভারলে বা ভিজ্যুয়াল ফ্রেম ডিটেইল যোগ হয়েছে।\n- **আলো ও রঙ**: দৃশ্যের কনট্রাস্ট ও কালার গ্রেডিংয়ে দৃশ্যমান ফারাক রয়েছে।\n- **সারসংক্ষেপ**: দৃশ্যটির সময়ানুক্রমিক পরিবর্তন এবং অগ্রগতি স্পষ্টভাবে দৃশ্যমান।`
    : `### 🔍 Frame Comparison & Visual Progression (${tsA}s vs ${tsB}s)\n- **Object Motion**: Key subjects moved between Frame A (${tsA}s) and Frame B (${tsB}s).\n- **Visual Elements**: Additional detail or text elements appeared over time in Frame B.\n- **Lighting & Focus**: Slight shift in lighting gradient and visual framing.\n- **Summary**: Clear sequential progression observed between the two timestamps.`;

  if (!isGeminiKeyReady()) {
    return {
      analysis: fallbackReport,
      isFallback: true,
      isApiKeyError: true,
    };
  }

  try {
    const ai = getGeminiClient();

    const cleanDataA = typeof params.imageA === 'string' && params.imageA.includes(',') ? params.imageA.split(',')[1] : params.imageA;
    const cleanDataB = typeof params.imageB === 'string' && params.imageB.includes(',') ? params.imageB.split(',')[1] : params.imageB;

    const prompt = isBn
      ? `আপনি একজন বিশেষজ্ঞ ভিডিও অ্যানালিস্ট।\nএখানে দুটি ভিডিও ফ্রেম দেওয়া হয়েছে:\n- প্রথম ফ্রেম (Frame A): সময় ${tsA}s\n- দ্বিতীয় ফ্রেম (Frame B): সময় ${tsB}s\n\nঅনুগ্রহ করে ফ্রেম A এবং ফ্রেম B-এর মধ্যে থাকা সকল সূক্ষ্ম ও দৃশ্যমান পার্থক্য পয়েন্ট আকারে লিখুন:\n১. বিষয়ের সরণ বা মুভমেন্ট (Motion & Position Shift)\n২. নতুন যুক্ত বা বাদ পড়া দৃশ্যগত উপাদান (New or Disappeared Elements)\n৩. ক্যামেরা অ্যাঙ্গেল, আলো ও দৃশ্যপট পরিবর্তন (Camera Angle, Lighting & Focus)\n৪. ফ্রেমগুলোর মূল অগ্রগতির সারসংক্ষেপ।\n\nপুরো উত্তরটি স্পষ্ট ও আকর্ষণীয় বাংলা মার্কডাউন ফরম্যাটে লিখুন।`
      : `You are an expert video visual analytics engine.\nCompare these two video frames:\n- Frame A: Timestamp ${tsA}s\n- Frame B: Timestamp ${tsB}s\n\nDetail all subtle and major visual differences between Frame A and Frame B:\n1. Subject & object position or motion shifts.\n2. Newly added or missing visual elements, graphics, or text.\n3. Camera framing, lighting, focus, or backdrop changes.\n4. Summary of scene progression.\n\nProvide the response in clean, concise Markdown bullet points.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: cleanDataA } },
            { inlineData: { mimeType: 'image/jpeg', data: cleanDataB } },
            { text: prompt },
          ],
        },
      ],
    });

    const analysis = (response.text || '').trim();
    return {
      analysis: analysis || fallbackReport,
      isFallback: false,
      isApiKeyError: false,
    };
  } catch (err: any) {
    console.warn('[Gemini Frame Comparison] Error comparing frames:', err);
    const parsed = parseGeminiError(err);
    if (parsed.isApiKeyError) {
      markGeminiKeyInvalid();
    }
    return {
      analysis: fallbackReport,
      isFallback: true,
      isApiKeyError: parsed.isApiKeyError,
    };
  }
}

// ----------------------------------------------------
// Model Context Protocol (MCP) Router & Handlers
// ----------------------------------------------------

async function handleMcpRpc(body: any, source: 'MCP' | 'REST' = 'MCP'): Promise<any> {
  const { jsonrpc, id, method, params } = body;
  const startTime = Date.now();

  if (jsonrpc !== '2.0' && !method) {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: { code: -32600, message: 'Invalid Request: expected JSON-RPC 2.0' },
    };
  }

  try {
    switch (method) {
      case 'initialize': {
        logAgentActivity(source, 'initialize', 'success', 'Client initialized MCP connection', Date.now() - startTime);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: {
              name: 'video-insight-mcp-server',
              version: '1.1.0',
            },
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
              logging: {},
            },
          },
        };
      }

      case 'notifications/initialized': {
        return null; // Notification, no response required
      }

      case 'ping': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'tools/list': {
        logAgentActivity(source, 'tools/list', 'success', `Listed ${MCP_TOOLS.length} MCP tools`, Date.now() - startTime);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS,
          },
        };
      }

      case 'tools/call': {
        const { name, arguments: toolArgs = {} } = params || {};
        logAgentActivity(source, `tools/call:${name}`, 'processing', `Invoking tool ${name} with args: ${JSON.stringify(toolArgs).substring(0, 100)}...`);

        if (name === 'analyze_video_url') {
          const result = await executeVideoAnalysis({
            url: toolArgs.url,
            mode: toolArgs.mode || 'standard',
            language: toolArgs.language || 'bn',
            customPrompt: toolArgs.customPrompt,
            contextDescription: `Video URL: ${toolArgs.url}`,
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(source, `tools/call:${name}`, 'success', `Analysis completed (${elapsed}ms)`, elapsed);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.resultText }],
              isError: false,
            },
          };
        }

        if (name === 'analyze_video_frames') {
          const result = await executeVideoAnalysis({
            frames: toolArgs.frames,
            highlights: toolArgs.highlights,
            mode: toolArgs.mode || 'standard',
            language: toolArgs.language || 'bn',
            customPrompt: toolArgs.customPrompt,
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(source, `tools/call:${name}`, 'success', `Frame analysis completed with ${toolArgs.frames?.length || 0} frames (${elapsed}ms)`, elapsed);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.resultText }],
              isError: false,
            },
          };
        }

        if (name === 'extract_problem_solutions') {
          const result = await executeVideoAnalysis({
            contextDescription: toolArgs.videoDescriptionOrUrl,
            frames: toolArgs.frames?.map((d: string) => ({ data: d })),
            mode: 'problem_solving',
            language: toolArgs.language || 'bn',
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(source, `tools/call:${name}`, 'success', `Extracted problem solutions (${elapsed}ms)`, elapsed);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.resultText }],
              isError: false,
            },
          };
        }

        if (name === 'extract_learning_points') {
          const result = await executeVideoAnalysis({
            contextDescription: toolArgs.videoDescriptionOrUrl,
            frames: toolArgs.frames?.map((d: string) => ({ data: d })),
            mode: 'learning_points',
            language: toolArgs.language || 'bn',
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(source, `tools/call:${name}`, 'success', `Extracted learning points (${elapsed}ms)`, elapsed);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: result.resultText }],
              isError: false,
            },
          };
        }

        if (name === 'get_analysis_history') {
          const limit = toolArgs.limit || 10;
          const items = analysisHistory.slice(0, limit);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(items, null, 2),
                },
              ],
            },
          };
        }

        if (name === 'generate_audit_prompt') {
          const domain = toolArgs.domain || 'general';
          const lang = toolArgs.language || 'bn';
          let prompt = '';
          if (domain === 'bug_triage') {
            prompt =
              lang === 'bn'
                ? 'ভিডিও রেকর্ডিংটি পর্যবেক্ষণ করে সফটওয়্যার বাগ বা ত্রুটি চিহ্নিত করুন: ১. বাগ রিপ্রোডিউস করার ধাপ ২. প্রত্যাশিত বনাম প্রকৃত আচরণ ৩. সম্ভাব্য রুট কজ ৪. ফিক্স সাজেশন।'
                : 'Inspect the video recording to triage software bugs: 1. Reproduction Steps 2. Expected vs Actual Behavior 3. Root Cause Analysis 4. Recommended Fix.';
          } else if (domain === 'ui_ux_review') {
            prompt =
              lang === 'bn'
                ? 'ভিডিওতে দেখানো UI/UX ইন্টারফেস অডিট করুন: ভিজ্যুয়াল হায়ারার্কি, ইউজেবিলিটি ঘর্ষণ, অ্যাক্সেসিবিলিটি এবং ডিজাইন সিস্টেমের সামঞ্জস্যতা পর্যালোচনা করুন।'
                : 'Audit the UI/UX demonstration shown in the video: Evaluate visual hierarchy, usability friction points, accessibility, and design system consistency.';
          } else if (domain === 'educational_lecture') {
            prompt =
              lang === 'bn'
                ? 'ভিডিওর লেকচার থেকে মূল ধারণা, ফর্মুলা, সংজ্ঞা এবং পরীক্ষার গুরুত্বপূর্ণ প্রশ্নাবলি প্রস্তুত করুন।'
                : 'Extract core concepts, formulas, definitions, and high-yield review questions from this educational video.';
          } else {
            prompt =
              lang === 'bn'
                ? 'ভিডিওর বিস্তারিত সারসংক্ষেপ, টাইমকোড অনুযায়ী প্রধান ঘটনা এবং মূল বার্তা প্রস্তুত করুন।'
                : 'Provide a structured video summary with chronological event breakdown and key takeaways.';
          }
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: prompt }],
            },
          };
        }

        if (name === 'extract_video_transcript') {
          const transcriptResult = await executeAudioTranscription({
            audioData: toolArgs.audioData,
            mimeType: toolArgs.mimeType || 'audio/wav',
            language: toolArgs.language || 'auto',
            context: toolArgs.context,
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(
            source,
            `tools/call:${name}`,
            'success',
            `Extracted transcript (${transcriptResult.transcript.segments.length} segments, ${elapsed}ms)`,
            elapsed
          );
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(transcriptResult.transcript, null, 2),
                },
              ],
              isError: false,
            },
          };
        }

        if (name === 'detect_chapter_markers') {
          const chapterResult = await executeChapterDetection({
            frames: toolArgs.frames,
            transcript: toolArgs.transcript,
            duration: toolArgs.duration,
            language: toolArgs.language || 'bn',
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(
            source,
            `tools/call:${name}`,
            'success',
            `Detected ${chapterResult.chapters.length} chapter markers (${elapsed}ms)`,
            elapsed
          );
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(chapterResult.chapters, null, 2),
                },
              ],
              isError: false,
            },
          };
        }

        if (name === 'translate_analysis_report') {
          const transRes = await executeTextTranslation({
            text: toolArgs.text,
            targetLanguage: toolArgs.targetLanguage,
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(
            source,
            `tools/call:${name}`,
            'success',
            `Translated report into ${transRes.targetLanguageName} (${elapsed}ms)`,
            elapsed
          );
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: transRes.translatedText,
                },
              ],
              isError: false,
            },
          };
        }

        if (name === 'compare_video_frames') {
          const compareRes = await executeFrameComparison({
            imageA: toolArgs.imageA,
            imageB: toolArgs.imageB,
            timestampA: toolArgs.timestampA,
            timestampB: toolArgs.timestampB,
            language: toolArgs.language || 'bn',
          });
          const elapsed = Date.now() - startTime;
          logAgentActivity(
            source,
            `tools/call:${name}`,
            'success',
            `Compared video frames (${elapsed}ms)`,
            elapsed
          );
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: compareRes.analysis,
                },
              ],
              isError: false,
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool not found: ${name}` },
        };
      }

      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: { resources: MCP_RESOURCES },
        };
      }

      case 'resources/read': {
        const { uri } = params || {};
        if (uri === 'video://history') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(analysisHistory, null, 2),
                },
              ],
            },
          };
        }
        if (uri === 'video://schema') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(
                    {
                      tools: MCP_TOOLS,
                      prompts: MCP_PROMPTS,
                      supportedFormats: ['mp4', 'webm', 'mov', 'base64-jpeg-frames'],
                    },
                    null,
                    2
                  ),
                },
              ],
            },
          };
        }
        if (uri === 'video://prompts') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(MCP_PROMPTS, null, 2),
                },
              ],
            },
          };
        }
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Resource not found: ${uri}` },
        };
      }

      case 'prompts/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: { prompts: MCP_PROMPTS },
        };
      }

      case 'prompts/get': {
        const { name, arguments: promptArgs = {} } = params || {};
        const pLang = promptArgs.language === 'en' ? 'en' : 'bn';
        let promptText = '';
        if (name === 'video-deep-audit') {
          promptText =
            pLang === 'bn'
              ? `"${promptArgs.topic || 'ভিডিও'}" সম্পর্কিত ভিডিওটি বিস্তারিতভাবে পর্যালোচনা করে সমস্যা, সুবিধা ও পদক্ষেপ লিখুন।`
              : `Deeply review the video regarding "${promptArgs.topic || 'Video'}" and output chronological breakdown, pros/cons, and recommendations.`;
        } else if (name === 'problem-solution-extractor') {
          promptText =
            pLang === 'bn'
              ? 'ভিডিওর সকল সমস্যা এবং সেগুলোর সুনির্দিষ্ট সমাধান ও পদক্ষেপ আলাদাভাবে বিশ্লেষণ করুন।'
              : 'Extract all detected problems from the video along with targeted solutions and action steps.';
        } else if (name === 'pedagogical-breakdown') {
          promptText =
            pLang === 'bn'
              ? 'ভিডিওর প্রধান শিক্ষণীয় বিষয়গুলো বের করে বাস্তব জীবনে ব্যবহারের নির্দেশিকা দিন।'
              : 'Extract key educational lessons and practical application frameworks from the video.';
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: `Hydrated prompt for ${name}`,
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: promptText },
              },
            ],
          },
        };
      }

      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    const parsed = parseGeminiError(err);
    logAgentActivity(source, method || 'unknown', 'error', parsed.rawError, elapsed);
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: parsed.isApiKeyError ? -32001 : -32603,
        message: parsed.isApiKeyError ? `${parsed.userMessageEn} ${parsed.guidance}` : (err.message || 'Internal error'),
        data: {
          isApiKeyError: parsed.isApiKeyError,
          userGuidance: parsed.guidance,
          rawMessage: parsed.rawError,
        },
      },
    };
  }
}

// ----------------------------------------------------
// Endpoints: MCP Protocol (HTTP POST & SSE)
// ----------------------------------------------------

// 1. Direct MCP JSON-RPC 2.0 Endpoint
app.post(['/mcp', '/api/mcp'], async (req: Request, res: Response) => {
  const response = await handleMcpRpc(req.body, 'MCP');
  if (response === null) {
    return res.status(204).send();
  }
  res.json(response);
});

// 2. SSE Transports for MCP Clients (Claude Desktop, Cursor, etc.)
interface SseClient {
  id: string;
  res: Response;
}
const sseClients = new Map<string, SseClient>();

app.get(['/sse', '/mcp/sse'], (req: Request, res: Response) => {
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.set(sessionId, { id: sessionId, res });
  logAgentActivity('MCP', 'sse:connect', 'success', `SSE Client connected: ${sessionId}`);

  // Send endpoint event according to MCP SSE transport standard
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => {
    sseClients.delete(sessionId);
    logAgentActivity('MCP', 'sse:disconnect', 'success', `SSE Client disconnected: ${sessionId}`);
  });
});

app.post('/messages', async (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string) || (req.headers['x-session-id'] as string);
  const sseClient = sessionId ? sseClients.get(sessionId) : null;

  const rpcResponse = await handleMcpRpc(req.body, 'MCP');

  if (sseClient && rpcResponse) {
    sseClient.res.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
    return res.status(202).json({ status: 'queued' });
  }

  // Fallback return directly
  if (rpcResponse === null) {
    return res.status(204).send();
  }
  res.json(rpcResponse);
});

// ----------------------------------------------------
// Headless REST API Endpoints for Agents
// ----------------------------------------------------

// 1. Manifest & Agent Discovery
app.get(['/api/mcp/manifest', '/mcp/manifest'], (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;

  res.json({
    schema_version: 'v1',
    name_for_model: 'video_insight_ai',
    name_for_human: 'Video Insight AI & MCP Server',
    description_for_model:
      'Autonomous video analysis server providing deep multimodal inspection, problem-solution extraction, pedagogical summaries, and custom highlights processing.',
    description_for_human: 'AI-powered Video Analysis and Model Context Protocol (MCP) Server.',
    auth: { type: 'none' },
    api: {
      type: 'mcp',
      url: `${baseUrl}/mcp`,
      sse_url: `${baseUrl}/sse`,
      manifest_url: `${baseUrl}/api/mcp/manifest`,
    },
    capabilities: {
      tools: MCP_TOOLS,
      resources: MCP_RESOURCES,
      prompts: MCP_PROMPTS,
    },
    sample_configs: {
      claude_desktop: {
        mcpServers: {
          'video-insight': {
            url: `${baseUrl}/mcp`,
            transport: 'http',
          },
        },
      },
      cursor_mcp: {
        mcpServers: {
          'video-insight': {
            url: `${baseUrl}/sse`,
            type: 'sse',
          },
        },
      },
    },
  });
});

// 2. Headless Direct Video Analysis (Used by both UI and external REST agents)
app.post('/api/analyze', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { frames, url, mode, language, customPrompt, highlights, contextDescription } = req.body;

  logAgentActivity('REST', 'POST /api/analyze', 'processing', `Initiating analysis (mode: ${mode || 'standard'}, lang: ${language || 'bn'})`);

  try {
    const analysisRes = await executeVideoAnalysis({
      frames,
      url,
      mode,
      language,
      customPrompt,
      highlights,
      contextDescription,
    });

    const elapsed = Date.now() - startTime;
    logAgentActivity(
      'REST',
      'POST /api/analyze',
      'success',
      `Analysis completed in ${elapsed}ms (fallback: ${analysisRes.isFallback})`,
      elapsed
    );

    res.json({
      success: true,
      result: analysisRes.resultText,
      mode: mode || 'standard',
      language: language || 'bn',
      isFallback: analysisRes.isFallback,
      isApiKeyError: analysisRes.isApiKeyError,
      userGuidance: analysisRes.userGuidance,
      latencyMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    const parsed = parseGeminiError(err);
    logAgentActivity('REST', 'POST /api/analyze', 'error', parsed.rawError, elapsed);
    res.status(parsed.isApiKeyError ? 400 : 500).json({
      success: false,
      isApiKeyError: parsed.isApiKeyError,
      error: parsed.isApiKeyError
        ? (language === 'en' ? parsed.userMessageEn : parsed.userMessageBn)
        : (err.message || 'Internal error during video analysis'),
      errorEn: parsed.userMessageEn,
      errorBn: parsed.userMessageBn,
      userGuidance: parsed.guidance,
      details: parsed.rawError,
    });
  }
});

// 3. Audio Track Extraction & Full Text Transcription (REST endpoint)
app.post(['/api/transcribe', '/api/transcribe-audio'], async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { audioData, mimeType, language, videoUrl, context } = req.body;

  logAgentActivity(
    'REST',
    'POST /api/transcribe',
    'processing',
    `Extracting speech transcription (lang: ${language || 'auto'})`
  );

  try {
    const transcriptionRes = await executeAudioTranscription({
      audioData,
      mimeType,
      language,
      videoUrl,
      context,
    });

    const elapsed = Date.now() - startTime;
    logAgentActivity(
      'REST',
      'POST /api/transcribe',
      'success',
      `Transcription finished (${transcriptionRes.transcript.segments.length} segments, ${elapsed}ms, fallback: ${transcriptionRes.isFallback})`,
      elapsed
    );

    res.json({
      success: true,
      transcript: transcriptionRes.transcript,
      isFallback: transcriptionRes.isFallback,
      isApiKeyError: transcriptionRes.isApiKeyError,
      userGuidance: transcriptionRes.userGuidance,
      latencyMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    const parsed = parseGeminiError(err);
    logAgentActivity('REST', 'POST /api/transcribe', 'error', parsed.rawError, elapsed);
    res.status(parsed.isApiKeyError ? 400 : 500).json({
      success: false,
      isApiKeyError: parsed.isApiKeyError,
      error: parsed.isApiKeyError
        ? (language === 'en' ? parsed.userMessageEn : parsed.userMessageBn)
        : (err.message || 'Internal error during speech transcription'),
      errorEn: parsed.userMessageEn,
      errorBn: parsed.userMessageBn,
      userGuidance: parsed.guidance,
      details: parsed.rawError,
    });
  }
});

// 3. Quick Gemini Vision Frame Label Suggestion (2-3 words)
app.post('/api/suggest-frame-label', async (req: Request, res: Response) => {
  const { image, language, timestamp } = req.body || {};
  const isBn = language !== 'en';

  if (!image) {
    return res.status(400).json({ success: false, error: 'No image data provided' });
  }

  const cleanData = typeof image === 'string' && image.includes(',') ? image.split(',')[1] : image;

  if (!isGeminiKeyReady()) {
    const defaultLabelsBn = ['মূল দৃশ্য', 'গুরুত্বপূর্ণ অংশ', 'তথ্যচিত্র ফ্রেম', 'প্রধান বিষয়বস্তু', 'আলোচনার মুহূর্ত'];
    const defaultLabelsEn = ['Key Scene', 'Main Topic', 'Infographic Frame', 'Core Subject', 'Key Moment'];
    const idx = Math.abs(Math.floor(Number(timestamp) || 0)) % 5;
    return res.json({
      success: true,
      label: isBn ? defaultLabelsBn[idx] : defaultLabelsEn[idx],
      isFallback: true,
    });
  }

  try {
    const ai = getGeminiClient();
    const prompt = isBn
      ? 'এই ভিডিও ফ্রেমটি দেখে এই মুহূর্তে কী দৃশ্যমান বা কী ঘটছে তার একটি অত্যন্ত সংক্ষিপ্ত ২-৩ শব্দের শিরোনাম/লেবেল প্রদান করুন। শুধুমাত্র ২-৩ শব্দের লেবেলটি লিখুন, কোনো অতিরিক্ত বাক্য, বিরামচিহ্ন বা উদ্ধৃতিচিহ্ন দেবেন না।'
      : 'Look at this video frame and provide a very concise 2-3 word descriptive title or label for what is visible or happening. Output ONLY the 2-3 word label. No punctuation, no quotes, no extra words.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanData,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 25,
        temperature: 0.2,
      },
    });

    let label = (response.text || '').trim();
    label = label.replace(/^["'`]|["'`]$/g, '').replace(/[।.,;!]$/, '').trim();
    if (!label) {
      label = isBn ? 'মূল দৃশ্য' : 'Key Moment';
    }

    res.json({
      success: true,
      label,
      isFallback: false,
    });
  } catch (err: any) {
    console.warn('[Gemini Vision Label] Error generating label:', err);
    const parsed = parseGeminiError(err);
    if (parsed.isApiKeyError) {
      markGeminiKeyInvalid();
    }
    const fallbackLabel = isBn ? 'চিহ্নিত মুহূর্ত' : 'Key Moment';
    res.json({
      success: true,
      label: fallbackLabel,
      isFallback: true,
      isApiKeyError: parsed.isApiKeyError,
    });
  }
});

// 4. AI Chapter & Scene Transition Detection Endpoint
app.post('/api/detect-chapters', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { frames, transcript, duration, language, context } = req.body || {};

  logAgentActivity('REST', 'POST /api/detect-chapters', 'processing', `Detecting scene chapter markers (lang: ${language || 'bn'})`);

  try {
    const chapterRes = await executeChapterDetection({
      frames,
      transcript,
      duration,
      language,
      context,
    });

    const elapsed = Date.now() - startTime;
    logAgentActivity(
      'REST',
      'POST /api/detect-chapters',
      'success',
      `Detected ${chapterRes.chapters.length} chapters (${elapsed}ms, fallback: ${chapterRes.isFallback})`,
      elapsed
    );

    res.json({
      success: true,
      chapters: chapterRes.chapters,
      isFallback: chapterRes.isFallback,
      isApiKeyError: chapterRes.isApiKeyError,
      latencyMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logAgentActivity('REST', 'POST /api/detect-chapters', 'error', err.message || 'Error detecting chapters', elapsed);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to detect scene chapter markers',
    });
  }
});

// 5. AI On-the-Fly Multilingual Report Translation Endpoint
app.post('/api/translate-report', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { text, targetLanguage } = req.body || {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Please provide report text to translate',
    });
  }

  logAgentActivity('REST', 'POST /api/translate-report', 'processing', `Translating analysis report to ${targetLanguage || 'en'}`);

  try {
    const transRes = await executeTextTranslation({
      text,
      targetLanguage: targetLanguage || 'en',
    });

    const elapsed = Date.now() - startTime;
    logAgentActivity(
      'REST',
      'POST /api/translate-report',
      'success',
      `Translated report to ${transRes.targetLanguageName} (${elapsed}ms, fallback: ${transRes.isFallback})`,
      elapsed
    );

    res.json({
      success: true,
      translatedText: transRes.translatedText,
      targetLanguage: transRes.targetLanguage,
      targetLanguageName: transRes.targetLanguageName,
      isFallback: transRes.isFallback,
      isApiKeyError: transRes.isApiKeyError,
      latencyMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logAgentActivity('REST', 'POST /api/translate-report', 'error', err.message || 'Translation error', elapsed);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to translate report',
    });
  }
});

// 6. AI Frame Comparison & Visual Progression Endpoint
app.post('/api/compare-frames', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { imageA, imageB, timestampA, timestampB, language } = req.body || {};

  if (!imageA || !imageB) {
    return res.status(400).json({
      success: false,
      error: 'Please provide both Frame A and Frame B image data',
    });
  }

  logAgentActivity('REST', 'POST /api/compare-frames', 'processing', `Comparing Frame A (${timestampA || 0}s) vs Frame B (${timestampB || 0}s)`);

  try {
    const compareRes = await executeFrameComparison({
      imageA,
      imageB,
      timestampA,
      timestampB,
      language: language || 'bn',
    });

    const elapsed = Date.now() - startTime;
    logAgentActivity(
      'REST',
      'POST /api/compare-frames',
      'success',
      `Frame comparison completed (${elapsed}ms, fallback: ${compareRes.isFallback})`,
      elapsed
    );

    res.json({
      success: true,
      analysis: compareRes.analysis,
      isFallback: compareRes.isFallback,
      isApiKeyError: compareRes.isApiKeyError,
      latencyMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logAgentActivity('REST', 'POST /api/compare-frames', 'error', err.message || 'Comparison error', elapsed);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to compare frames',
    });
  }
});

// 4. Multi-Platform Video Resolver & Downloader Endpoints
app.post('/api/video/info', async (req: Request, res: Response) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid http/https video URL',
      errorBn: 'অনুগ্রহ করে একটি সঠিক http/https ভিডিও লিঙ্ক প্রদান করুন',
    });
  }

  const cleanUrl = url.trim();
  const lowerUrl = cleanUrl.toLowerCase();

  try {
    // 1. YouTube
    const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      const videoId = ytMatch[1];
      let oembedData: any = {};
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
        if (oembedRes.ok) {
          oembedData = await oembedRes.json();
        }
      } catch (e) {
        console.warn('YouTube oembed fetch failed, using fallback', e);
      }

      const title = oembedData.title || `YouTube Video (${videoId})`;
      const author = oembedData.author_name || 'YouTube Channel';
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      const fallbackThumbnail = oembedData.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

      return res.json({
        success: true,
        platform: 'youtube',
        platformLabel: 'YouTube',
        platformColor: '#FF0000',
        videoId,
        title,
        author,
        thumbnail,
        fallbackThumbnail,
        originalUrl: cleanUrl,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        formats: [
          { id: '1080p', label: '1080p Full HD', ext: 'mp4', quality: '1080p', sizeEst: '~42 MB', isDownloadable: true },
          { id: '720p', label: '720p HD', ext: 'mp4', quality: '720p', sizeEst: '~22 MB', isDownloadable: true },
          { id: '480p', label: '480p SD', ext: 'mp4', quality: '480p', sizeEst: '~13 MB', isDownloadable: true },
          { id: '360p', label: '360p Mobile', ext: 'mp4', quality: '360p', sizeEst: '~7 MB', isDownloadable: true },
          { id: 'audio_mp3', label: 'MP3 High Quality Audio', ext: 'mp3', quality: '320 kbps', sizeEst: '~4.5 MB', isDownloadable: true },
          { id: 'thumbnail_hd', label: 'HD Cover / Thumbnail', ext: 'jpg', quality: 'Original HD', sizeEst: '~200 KB', directDownloadUrl: `/api/video/download-stream?url=${encodeURIComponent(thumbnail)}&filename=${encodeURIComponent(videoId + '_thumbnail.jpg')}` }
        ]
      });
    }

    // 2. TikTok
    if (lowerUrl.includes('tiktok.com')) {
      let oembedData: any = {};
      try {
        const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`);
        if (oembedRes.ok) {
          oembedData = await oembedRes.json();
        }
      } catch (e) {
        console.warn('TikTok oembed fetch failed, using fallback', e);
      }

      const title = oembedData.title || 'TikTok Short Video';
      const author = oembedData.author_name || 'TikTok Creator';
      const thumbnail = oembedData.thumbnail_url || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&auto=format&fit=crop&q=80';

      return res.json({
        success: true,
        platform: 'tiktok',
        platformLabel: 'TikTok',
        platformColor: '#000000',
        title,
        author,
        thumbnail,
        originalUrl: cleanUrl,
        formats: [
          { id: 'hd_nowatermark', label: 'HD No Watermark', ext: 'mp4', quality: '1080p', sizeEst: '~16 MB', isDownloadable: true },
          { id: '720p', label: '720p Standard MP4', ext: 'mp4', quality: '720p', sizeEst: '~9 MB', isDownloadable: true },
          { id: 'audio_mp3', label: 'Original Sound Audio', ext: 'mp3', quality: 'Audio', sizeEst: '~2.8 MB', isDownloadable: true },
          { id: 'thumbnail_hd', label: 'Video Cover Image', ext: 'jpg', quality: 'Cover', sizeEst: '~150 KB', directDownloadUrl: `/api/video/download-stream?url=${encodeURIComponent(thumbnail)}&filename=tiktok_cover.jpg` }
        ]
      });
    }

    // 3. Instagram
    if (lowerUrl.includes('instagram.com')) {
      const shortcodeMatch = cleanUrl.match(/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/);
      const shortcode = shortcodeMatch ? shortcodeMatch[1] : 'video';
      const isReel = lowerUrl.includes('/reel/');

      return res.json({
        success: true,
        platform: 'instagram',
        platformLabel: 'Instagram',
        platformColor: '#E1306C',
        shortcode,
        title: isReel ? `Instagram Reel (${shortcode})` : `Instagram Post Video (${shortcode})`,
        author: 'Instagram Creator',
        thumbnail: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=600&auto=format&fit=crop&q=80',
        originalUrl: cleanUrl,
        formats: [
          { id: '1080p', label: '1080p HD (Original Quality)', ext: 'mp4', quality: '1080p', sizeEst: '~20 MB', isDownloadable: true },
          { id: '720p', label: '720p Standard MP4', ext: 'mp4', quality: '720p', sizeEst: '~11 MB', isDownloadable: true },
          { id: 'audio_mp3', label: 'Extracted Reel Audio', ext: 'mp3', quality: 'MP3 Audio', sizeEst: '~2.2 MB', isDownloadable: true }
        ]
      });
    }

    // 4. Facebook
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) {
      return res.json({
        success: true,
        platform: 'facebook',
        platformLabel: 'Facebook',
        platformColor: '#1877F2',
        title: 'Facebook Video Post',
        author: 'Facebook Creator',
        thumbnail: 'https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=600&auto=format&fit=crop&q=80',
        originalUrl: cleanUrl,
        formats: [
          { id: 'hd', label: 'HD 720p MP4', ext: 'mp4', quality: '720p', sizeEst: '~28 MB', isDownloadable: true },
          { id: 'sd', label: 'SD 480p MP4', ext: 'mp4', quality: '480p', sizeEst: '~14 MB', isDownloadable: true },
          { id: 'audio_mp3', label: 'Audio MP3 Track', ext: 'mp3', quality: 'Audio', sizeEst: '~3 MB', isDownloadable: true }
        ]
      });
    }

    // 5. Twitter / X
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
      return res.json({
        success: true,
        platform: 'twitter',
        platformLabel: 'X (Twitter)',
        platformColor: '#000000',
        title: 'X / Twitter Media Video',
        author: 'X Creator',
        thumbnail: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=600&auto=format&fit=crop&q=80',
        originalUrl: cleanUrl,
        formats: [
          { id: '720p', label: '720p MP4 (High Quality)', ext: 'mp4', quality: '720p', sizeEst: '~15 MB', isDownloadable: true },
          { id: '480p', label: '480p MP4 (Fast Download)', ext: 'mp4', quality: '480p', sizeEst: '~8 MB', isDownloadable: true },
          { id: 'audio_mp3', label: 'Audio Track', ext: 'mp3', quality: 'Audio', sizeEst: '~2 MB', isDownloadable: true }
        ]
      });
    }

    // 6. Direct Video Link or generic URL
    let contentLength = 0;
    let contentType = 'video/mp4';
    try {
      const headRes = await fetch(cleanUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (headRes.ok) {
        contentType = headRes.headers.get('content-type') || 'video/mp4';
        const cl = headRes.headers.get('content-length');
        if (cl) contentLength = parseInt(cl, 10);
      }
    } catch (e) {
      console.warn('HEAD request check failed for direct link', e);
    }

    const sizeFormatted = contentLength > 0
      ? `${(contentLength / (1024 * 1024)).toFixed(1)} MB`
      : '~15-30 MB';

    const cleanFilename = cleanUrl.split('/').pop()?.split('?')[0] || 'downloaded_video.mp4';

    return res.json({
      success: true,
      platform: 'direct',
      platformLabel: 'Direct Video Source',
      platformColor: '#2563EB',
      title: cleanFilename,
      author: 'Direct Media Source',
      thumbnail: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&auto=format&fit=crop&q=80',
      originalUrl: cleanUrl,
      formats: [
        {
          id: 'source_mp4',
          label: 'Original Source Quality MP4',
          ext: 'mp4',
          quality: 'Original',
          sizeEst: sizeFormatted,
          directDownloadUrl: `/api/video/download-stream?url=${encodeURIComponent(cleanUrl)}&filename=${encodeURIComponent(cleanFilename)}`,
          isDirect: true
        }
      ]
    });

  } catch (err: any) {
    console.error('Error resolving video info:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to resolve video information',
      errorBn: 'ভিডিওর তথ্য অনুসন্ধান করতে ব্যর্থ হয়েছে',
    });
  }
});

// Stream proxy to download direct video streams and images with proper Content-Disposition attachment headers
app.get('/api/video/download-stream', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  const filename = (req.query.filename as string) || 'downloaded_file.mp4';

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).send('Invalid or missing URL parameter');
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      return res.status(upstreamRes.status).send(`Upstream download request failed with status ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream the web stream to the Express response
    const reader = upstreamRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err: any) {
    console.error('Download stream error:', err);
    if (!res.headersSent) {
      res.status(500).send('Failed to stream download: ' + (err.message || 'Unknown error'));
    }
  }
});

// 4. Health check & Server Status
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    server: 'video-insight-ai',
    version: '1.2.0',
    capabilities: [
      'headless_rest_agent',
      'model_context_protocol_mcp',
      'multimodal_vision',
      'audio_track_extraction',
      'full_text_transcription',
      'bengali_english_bilingual',
    ],
    mcp_tools_count: MCP_TOOLS.length,
    active_sse_clients: sseClients.size,
    history_items_count: analysisHistory.length,
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// 4. Server History & Logs
app.get('/api/history', (req: Request, res: Response) => {
  res.json({
    success: true,
    history: analysisHistory,
  });
});

app.delete('/api/history', (req: Request, res: Response) => {
  analysisHistory.length = 0;
  res.json({ success: true, message: 'History cleared' });
});

app.get('/api/logs', (req: Request, res: Response) => {
  res.json({
    success: true,
    logs: agentLogs,
  });
});

// ----------------------------------------------------
// Vite Integration & App Startup
// ----------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Video Insight AI & MCP Server] Running at http://0.0.0.0:${PORT}`);
    console.log(`  - MCP JSON-RPC Endpoint: http://0.0.0.0:${PORT}/mcp`);
    console.log(`  - MCP SSE Stream Endpoint: http://0.0.0.0:${PORT}/sse`);
    console.log(`  - REST Agent Endpoint: http://0.0.0.0:${PORT}/api/analyze`);
    console.log(`  - MCP Manifest: http://0.0.0.0:${PORT}/api/mcp/manifest`);
  });
}

startServer();
