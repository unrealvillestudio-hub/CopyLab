/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings2, LayoutGrid, Wrench, Search, Bell } from 'lucide-react';
import { Logo } from './constants/logo';
import { BUILD_TAG } from './config/buildTag';
import { DebugOverlay } from './core/debug/DebugOverlay';
import { cn } from './ui/components';

import { CopyCustomizeModule } from './modules/customize/CopyCustomizeModule';
import { CopyPackModule }      from './modules/promptpack/CopyPackModule';
import { CopyToolsModule }     from './modules/tools/CopyToolsModule';

// Customize is first — it's the setup step before generating
type TabType = 'customize' | 'copypack' | 'tools';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('customize');

  const tabs: { id: TabType; label: string; icon: any; hint?: string }[] = [
    { id: 'customize', label: 'Customize', icon: Settings2, hint: 'Setup' },
    { id: 'copypack',  label: 'CopyPack',  icon: LayoutGrid, hint: 'Generate' },
    { id: 'tools',     label: 'Tools',     icon: Wrench,     hint: 'Refine' },
  ];

  return (
    <div className="min-h-screen bg-uv-bg text-uv-text selection:bg-accent/30">
      <DebugOverlay />

      {/* Header */}
      <header className="h-16 border-b border-uv-border px-6 flex items-center justify-between sticky top-0 bg-uv-bg/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="h-4 w-[1px] bg-uv-border hidden md:block" />
          <div className="hidden md:flex items-center gap-2">
            <span className="text-sm font-bold text-accent">UNRLVL - CopyLab</span>
            <span className="px-1.5 py-0.5 rounded bg-uv-border text-[10px] font-mono text-uv-text-muted">{BUILD_TAG}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-uv-text-muted" />
            <input type="text" placeholder="Search assets..."
              className="bg-uv-card border border-uv-border rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:border-accent/50 w-64 transition-colors" />
          </div>
          <button className="p-2 hover:bg-uv-border rounded-full transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-accent rounded-full border-2 border-uv-bg" />
          </button>
          <button className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-black font-bold text-xs">
            UV
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-uv-card p-1 rounded-xl border border-uv-border w-fit">
          {tabs.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-accent text-black shadow-lg shadow-accent/20"
                  : "text-uv-text-muted hover:text-uv-text hover:bg-white/5"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.hint && (
                <span className={cn(
                  "text-[9px] font-mono px-1.5 py-0.5 rounded hidden sm:block",
                  activeTab === tab.id ? "bg-black/20 text-black/70" : "bg-uv-border text-uv-text-muted"
                )}>
                  {idx + 1}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Flow hint */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-uv-text-muted">
          <span className={cn(activeTab === 'customize' ? 'text-accent' : '')}>1. Customize</span>
          <span>→</span>
          <span className={cn(activeTab === 'copypack' ? 'text-accent' : '')}>2. CopyPack</span>
          <span>→</span>
          <span className={cn(activeTab === 'tools' ? 'text-accent' : '')}>3. Tools</span>
        </div>

        {/* Content Area */}
        <div className="pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'customize' && <CopyCustomizeModule />}
              {activeTab === 'copypack'  && <CopyPackModule />}
              {activeTab === 'tools'     && <CopyToolsModule />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-10 border-t border-uv-border px-6 flex items-center justify-between text-[10px] font-mono text-uv-text-muted uppercase tracking-widest bg-uv-bg/50 backdrop-blur-sm fixed bottom-0 left-0 right-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System Ready
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span>UnrealVille Studio // CopyLab</span>
          <span className="text-accent/50">{BUILD_TAG}</span>
        </div>
      </footer>
    </div>
  );
}
