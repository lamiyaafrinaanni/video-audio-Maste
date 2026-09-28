import React from 'react';
import { 
  Video, 
  Download, 
  Bot, 
  Globe, 
  Sparkles,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { Language, ThemeMode } from '../types';

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  mainView: 'studio' | 'downloader' | 'mcp';
  onViewChange: (view: 'studio' | 'downloader' | 'mcp') => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  effectiveTheme: 'light' | 'dark';
}

export const Header: React.FC<HeaderProps> = ({
  lang,
  onLanguageChange,
  mainView,
  onViewChange,
  themeMode,
  onThemeChange,
  effectiveTheme,
}) => {
  const isBn = lang === 'bn';

  return (
    <header className="app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div 
              onClick={() => onViewChange('studio')}
              className="app-logo-box"
              title={isBn ? "ভিডিও স্টুডিও" : "Video Studio"}
              aria-label="App Logo"
            >
              <Video className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] leading-tight">
                  {isBn ? "ভিডিও বিশ্লেষক AI" : "Video Insight AI"}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--brand-light)] text-[var(--brand-text)] border border-[var(--brand-border)]">
                  <Sparkles className="w-2.5 h-2.5" />
                  Gemini 3.8
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[var(--text-muted)] font-medium">
                {isBn ? "স্মার্ট ভিডিও বিশ্লেষণ ও ডাউনলোডার" : "Intelligent Video Analysis & Downloader"}
              </p>
            </div>
          </div>

          {/* Desktop & Tablet Navigation Tabs */}
          <nav className="hidden md:flex app-nav" aria-label="Main Navigation">
            <button
              id="nav-tab-studio"
              type="button"
              onClick={() => onViewChange('studio')}
              className={`app-nav-btn ${
                mainView === 'studio' ? 'app-nav-btn-active' : 'app-nav-btn-inactive'
              }`}
            >
              <Video className="w-4 h-4 text-[var(--brand-primary)]" />
              <span>{isBn ? "ভিডিও স্টুডিও" : "Video Studio"}</span>
            </button>

            <button
              id="nav-tab-downloader"
              type="button"
              onClick={() => onViewChange('downloader')}
              className={`app-nav-btn ${
                mainView === 'downloader' ? 'app-nav-btn-active' : 'app-nav-btn-inactive'
              }`}
            >
              <Download className="w-4 h-4 text-[var(--downloader-accent)]" />
              <span>{isBn ? "ডাউনলোডার" : "Downloader"}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[var(--downloader-light)] text-[var(--downloader-text)]">
                All
              </span>
            </button>

            <button
              id="nav-tab-mcp"
              type="button"
              onClick={() => onViewChange('mcp')}
              className={`app-nav-btn ${
                mainView === 'mcp' ? 'app-nav-btn-active' : 'app-nav-btn-inactive'
              }`}
            >
              <Bot className="w-4 h-4 text-[var(--mcp-accent)]" />
              <span>{isBn ? "MCP এজেন্ট হাব" : "MCP Agent Hub"}</span>
              <span className="w-2 h-2 rounded-full bg-[var(--mcp-accent)] animate-pulse" />
            </button>
          </nav>

          {/* Right Actions: Theme Mode & Language Selector */}
          <div className="flex items-center gap-2">
            {/* Theme Mode Button */}
            <button
              id="theme-toggle-btn"
              type="button"
              onClick={() => {
                const nextMode: ThemeMode = 
                  themeMode === 'system' ? (effectiveTheme === 'dark' ? 'light' : 'dark') :
                  themeMode === 'dark' ? 'light' :
                  themeMode === 'light' ? 'system' : 'system';
                onThemeChange(nextMode);
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-lg transition-colors min-h-[36px] cursor-pointer active:scale-95"
              title={
                isBn
                  ? `থিম: ${themeMode === 'system' ? `অটো সিস্টেম (${effectiveTheme === 'dark' ? 'ডার্ক' : 'লাইট'})` : themeMode === 'dark' ? 'ডার্ক' : 'লাইট'} - পরিবর্তন করতে ক্লিক করুন`
                  : `Theme: ${themeMode === 'system' ? `Auto System (${effectiveTheme})` : themeMode === 'dark' ? 'Dark' : 'Light'} - Click to cycle`
              }
              aria-label="Toggle Theme Mode"
            >
              {themeMode === 'system' ? (
                <Monitor className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              ) : effectiveTheme === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              )}
              <span className="hidden sm:inline">
                {themeMode === 'system'
                  ? (isBn ? 'অটো' : 'Auto')
                  : themeMode === 'dark'
                    ? (isBn ? 'ডার্ক' : 'Dark')
                    : (isBn ? 'লাইট' : 'Light')}
              </span>
              {themeMode === 'system' && (
                <span 
                  className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)]" 
                  title={isBn ? "সিস্টেম প্রেফারেন্স সক্রিয়" : "System preference active"}
                />
              )}
            </button>

            {/* Language Selector */}
            <button
              id="lang-toggle-btn"
              type="button"
              onClick={() => onLanguageChange(lang === 'bn' ? 'en' : 'bn')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-lg transition-colors min-h-[36px] cursor-pointer active:scale-95"
              aria-label={isBn ? "ভাষা পরিবর্তন করুন" : "Switch Language"}
            >
              <Globe className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden border-t border-[var(--border-subtle)] bg-[var(--surface-card-subtle)] px-3 py-1.5">
        <nav className="flex items-center justify-between gap-1 max-w-sm mx-auto" aria-label="Mobile Navigation">
          <button
            type="button"
            onClick={() => onViewChange('studio')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all min-h-[44px] ${
              mainView === 'studio'
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>{isBn ? "স্টুডিও" : "Studio"}</span>
          </button>

          <button
            type="button"
            onClick={() => onViewChange('downloader')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all min-h-[44px] ${
              mainView === 'downloader'
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-[var(--downloader-accent)]" />
            <span>{isBn ? "ডাউনলোডার" : "Download"}</span>
          </button>

          <button
            type="button"
            onClick={() => onViewChange('mcp')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-semibold rounded-lg transition-all min-h-[44px] ${
              mainView === 'mcp'
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)] font-bold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[var(--mcp-accent)]" />
            <span>MCP</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
