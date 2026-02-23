import React, { useState } from 'react';
import { 
  CopyLanguage, 
  CopyTone, 
  CopyOutputFormat, 
  CopyOutput,
  BrandProfile
} from '../../core/types';
import { BRANDS } from '../../config/brands';
import { COPY_PACKS } from '../../config/packs';
import { TONE_PRESETS, FORMAT_PRESETS } from '../../config/presets';
import { Card, Button, cn } from '../../ui/components';
import { RunControlButton } from '../../ui/RunControlButton';
import { runCopyPack } from '../../services/promptpack';
import { useSessionOutputsStore } from '../../state/sessionOutputsStore';
import { Copy, Save, CheckCircle2, AlertCircle, Globe, Zap, Type, Download, User, Mic } from 'lucide-react';

export const CopyPackModule = () => {
  const [brandId, setBrandId] = useState(BRANDS[0].id);
  const [language, setLanguage] = useState<CopyLanguage>("ES");
  const [packId, setPackId] = useState(Object.keys(COPY_PACKS)[0]);
  const [productContext, setProductContext] = useState('');
  const [keywords, setKeywords] = useState('');
  const [tone, setTone] = useState<CopyTone>("conversational");
  const [outputFormat, setOutputFormat] = useState<CopyOutputFormat>("markdown");
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputs, setOutputs] = useState<CopyOutput[]>([]);

  // VideoPodcast specific state
  const [personaA, setPersonaA] = useState({ name: '', expertise: '' });
  const [personaB, setPersonaB] = useState({ name: '', expertise: '' });
  const [episodeTheme, setEpisodeTheme] = useState('');
  const [keyPoints, setKeyPoints] = useState('');

  const addSessionOutput = useSessionOutputsStore((state: any) => state.addSessionOutput);

  const isPodcastPack = packId === 'video_podcast_script';

  const handleRun = async () => {
    setIsGenerating(true);
    try {
      const brand = BRANDS.find(b => b.id === brandId) as BrandProfile;
      const pack = COPY_PACKS[packId];
      
      let finalContext = productContext;
      if (isPodcastPack) {
        finalContext = `
          PODCAST THEME: ${episodeTheme}
          HOST (Persona A): ${personaA.name} - ${personaA.expertise}
          GUEST (Persona B): ${personaB.name} - ${personaB.expertise}
          KEY POINTS: ${keyPoints}
          ${productContext}
        `.trim();
      }

      const results = await runCopyPack({
        brand,
        pack,
        language,
        keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
        productContext: finalContext,
        tone,
        ctaBase: "Standard CTA",
        outputFormat
      });
      setOutputs(results);
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportScriptJson = () => {
    const scriptBlocks = outputs.map(o => ({
      label: o.label,
      speaker: getSpeakerForJob(o.metadata?.job_id),
      content: o.content
    }));
    
    const blob = new Blob([JSON.stringify(scriptBlocks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getSpeakerForJob = (jobId: string) => {
    if (!isPodcastPack) return null;
    switch (jobId) {
      case 'episode_hook': return 'HOST';
      case 'intro_personas': return 'HOST';
      case 'qa_blocks': return 'HOST & GUEST';
      case 'key_takeaway': return 'HOST';
      case 'cta_close': return 'HOST';
      default: return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. CONTEXTO DE MARCA */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Marca</label>
          <select 
            value={brandId} 
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {BRANDS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Idioma</label>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value as CopyLanguage)}
            className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="ES">Español (ES)</option>
            <option value="es-FL">Español (Florida)</option>
            <option value="SPANG">Spanglish</option>
            <option value="EN">English</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Pack</label>
          <select 
            value={packId} 
            onChange={(e) => setPackId(e.target.value)}
            className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {Object.values(COPY_PACKS).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </section>

      {/* 2. CONTEXTO DE CAMPAÑA / PODCAST */}
      <section className="space-y-4">
        {isPodcastPack ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-4 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2 text-accent">
                <Mic className="w-4 h-4" /> Participants
              </h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-uv-text-muted uppercase">Persona A (HOST)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      placeholder="Name" 
                      value={personaA.name}
                      onChange={(e) => setPersonaA({ ...personaA, name: e.target.value })}
                      className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <input 
                      placeholder="Expertise" 
                      value={personaA.expertise}
                      onChange={(e) => setPersonaA({ ...personaA, expertise: e.target.value })}
                      className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-uv-text-muted uppercase">Persona B (GUEST)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      placeholder="Name" 
                      value={personaB.name}
                      onChange={(e) => setPersonaB({ ...personaB, name: e.target.value })}
                      className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                    <input 
                      placeholder="Expertise" 
                      value={personaB.expertise}
                      onChange={(e) => setPersonaB({ ...personaB, expertise: e.target.value })}
                      className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-4 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2 text-accent">
                <Type className="w-4 h-4" /> Episode Brief
              </h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-uv-text-muted uppercase">Tema del episodio</label>
                  <textarea 
                    value={episodeTheme}
                    onChange={(e) => setEpisodeTheme(e.target.value)}
                    className="w-full h-16 bg-uv-bg border border-uv-border rounded p-2 text-xs outline-none focus:border-accent resize-none"
                    placeholder="Describe el tema central..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-uv-text-muted uppercase">Key Points (uno por línea)</label>
                  <textarea 
                    value={keyPoints}
                    onChange={(e) => setKeyPoints(e.target.value)}
                    className="w-full h-20 bg-uv-bg border border-uv-border rounded p-2 text-xs outline-none focus:border-accent resize-none"
                    placeholder="Punto 1&#10;Punto 2..."
                  />
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Contexto de producto/servicio</label>
              <textarea 
                value={productContext}
                onChange={(e) => setProductContext(e.target.value)}
                placeholder="Pega aquí el contexto de marca o describe el producto/servicio para esta campaña"
                className="w-full h-32 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Keywords</label>
              <input 
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="keyword1, keyword2, keyword3"
                className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </>
        )}
      </section>

      {/* 3. CONTROLES */}
      <section className="flex flex-wrap items-end gap-4">
        <div className="space-y-2 min-w-[150px]">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Tono</label>
          <select 
            value={tone} 
            onChange={(e) => setTone(e.target.value as CopyTone)}
            className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {TONE_PRESETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="space-y-2 min-w-[150px]">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Formato</label>
          <select 
            value={outputFormat} 
            onChange={(e) => setOutputFormat(e.target.value as CopyOutputFormat)}
            className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {FORMAT_PRESETS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <RunControlButton 
            isLoading={isGenerating} 
            onClick={handleRun} 
            label="Generar Copy"
          />
          {outputs.length > 0 && isPodcastPack && (
            <Button variant="secondary" onClick={exportScriptJson} className="h-12 gap-2">
              <Download className="w-4 h-4" /> Exportar JSON
            </Button>
          )}
        </div>
      </section>

      {/* 5. OUTPUT AREA */}
      <section className="space-y-6">
        {outputs.map((output, idx) => {
          const speaker = getSpeakerForJob(output.metadata?.job_id);
          return (
            <Card key={output.id} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{output.label}</span>
                  {speaker && (
                    <span className="px-2 py-0.5 rounded bg-white/10 text-white text-[10px] font-mono uppercase tracking-wider border border-white/20">
                      {speaker}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-mono uppercase tracking-wider">
                    {output.channel}
                  </span>
                  {output.metadata?.compliance_passed ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono">
                      <CheckCircle2 className="w-3 h-3" /> COMPLIANCE OK
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-rose-500 font-mono">
                      <AlertCircle className="w-3 h-3" /> COMPLIANCE ISSUE
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="p-2" onClick={() => copyToClipboard(output.content)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" className="p-2" onClick={() => addSessionOutput(output)}>
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <textarea 
                defaultValue={output.content}
                className="w-full h-40 bg-uv-bg/50 border border-uv-border rounded-lg p-4 text-sm font-medium leading-relaxed outline-none focus:border-accent/50 resize-none"
              />
              {output.metadata?.compliance_warnings?.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                  <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Warnings</p>
                  <ul className="text-xs text-rose-400/80 list-disc list-inside">
                    {output.metadata.compliance_warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
};
