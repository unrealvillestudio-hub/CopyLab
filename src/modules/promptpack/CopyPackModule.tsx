/**
 * UNRLVL CopyLab — CopyPackModule.tsx
 * Generación de copy. Lee toda la config del sessionStore.
 * El usuario configura en Customize — aquí solo genera.
 */

import React, { useState } from 'react';
import { CopyOutput, BrandProfile } from '../../core/types';
import { useBrands } from '../../hooks/useBrands';
import { COPY_PACKS } from '../../config/packs';
import { Card, Button, cn } from '../../ui/components';
import { RunControlButton } from '../../ui/RunControlButton';
import { runCopyPack } from '../../services/promptpack';
import { useSessionStore, VARIANT_TEMPERATURE } from '../../state/sessionStore';
import { Copy, CheckCircle2, AlertCircle, Download, Mic, Type, Settings2, ChevronRight } from 'lucide-react';

export const CopyPackModule = () => {
  const { toBrandProfile, brands } = useBrands();
  const {
    activeBrandId, activeLanguage, activePackId, activeServicio,
    activeKeywords, activeTone, activeOutputFormat, activeExtraContext,
    customizeOptions, addSessionOutputs,
  } = useSessionStore();

  const [outputs, setOutputs] = useState<CopyOutput[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // VideoPodcast state
  const [personaA, setPersonaA] = useState({ name: '', expertise: '' });
  const [personaB, setPersonaB] = useState({ name: '', expertise: '' });
  const [episodeTheme, setEpisodeTheme] = useState('');
  const [keyPoints, setKeyPoints] = useState('');

  const packId = activePackId || Object.keys(COPY_PACKS)[0];
  const pack = COPY_PACKS[packId];
  const isPodcastPack = packId === 'video_podcast_script';
  const brandName = brands.find(b => b.id === activeBrandId)?.name || '';
  const isReady = !!activeBrandId && !!activeServicio.trim();

  const handleRun = async () => {
    if (!isReady) return;
    setIsGenerating(true);
    try {
      const brand = toBrandProfile(activeBrandId) as BrandProfile;
      if (!brand) throw new Error(`Marca '${activeBrandId}' no encontrada`);

      let finalContext = activeServicio;
      if (isPodcastPack) {
        finalContext = `PODCAST THEME: ${episodeTheme}\nHOST: ${personaA.name} - ${personaA.expertise}\nGUEST: ${personaB.name} - ${personaB.expertise}\nKEY POINTS: ${keyPoints}\n${activeServicio}`.trim();
      }
      if (activeExtraContext) finalContext += `\n\nContexto adicional: ${activeExtraContext}`;

      // Apply variant_style temperature
      const temperature = VARIANT_TEMPERATURE[customizeOptions.variant_style];

      // Build extra instructions from customize options
      const extraNotes = [
        customizeOptions.include_hashtags ? 'Incluir hashtags relevantes.' : '',
        customizeOptions.include_emojis   ? 'Incluir emojis donde aporten valor.' : '',
        customizeOptions.include_cta      ? 'Incluir CTA al final.' : 'No incluir CTA.',
        customizeOptions.extra_notes,
      ].filter(Boolean).join(' ');

      const results = await runCopyPack({
        brand, pack,
        language: activeLanguage,
        keywords: activeKeywords.split(',').map(k => k.trim()).filter(Boolean),
        productContext: finalContext,
        tone: activeTone,
        ctaBase: 'Standard CTA',
        outputFormat: activeOutputFormat,
        extraNotes,
      });

      // Block if strict compliance and warnings found
      if (customizeOptions.compliance_mode === 'strict') {
        const hasWarnings = results.some(r => !r.metadata?.compliance_passed);
        if (hasWarnings) {
          alert('Compliance STRICT: se encontraron warnings. Ajusta el contenido antes de generar.');
          setIsGenerating(false);
          return;
        }
      }

      setOutputs(results);
      addSessionOutputs(results);
    } catch (error) {
      console.error('[CopyPackModule]', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportScriptJson = () => {
    const blob = new Blob([JSON.stringify(outputs.map(o => ({
      label: o.label, speaker: getSpeakerForJob(o.metadata?.job_id), content: o.content
    })), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `script_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const getSpeakerForJob = (jobId: string) => {
    if (!isPodcastPack) return null;
    return { episode_hook: 'HOST', intro_personas: 'HOST', qa_blocks: 'HOST & GUEST', key_takeaway: 'HOST', cta_close: 'HOST' }[jobId] ?? null;
  };

  // Not ready state
  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
        <Settings2 className="w-10 h-10 text-uv-text-muted opacity-30" />
        <p className="text-sm font-bold text-uv-text-muted">Configura el contexto primero</p>
        <p className="text-xs text-uv-text-muted max-w-sm">
          Ve a la pestaña <strong className="text-accent">Customize</strong> y selecciona la marca y el producto/servicio para comenzar a generar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* CONFIG ACTIVA — solo lectura */}
      <div className="bg-uv-card border border-uv-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Configuración activa</p>
          <span className="text-[10px] font-mono text-uv-text-muted">← ajusta en Customize</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: brandName, color: 'text-accent' },
            { label: activeLanguage },
            { label: pack?.label },
            { label: activeTone },
            { label: activeOutputFormat.toUpperCase() },
            { label: customizeOptions.variant_style },
            { label: customizeOptions.compliance_mode },
          ].filter(i => i.label).map((item, i) => (
            <span key={i} className={cn(
              "px-2 py-0.5 rounded bg-uv-border text-[11px] font-mono",
              item.color || 'text-uv-text-muted'
            )}>{item.label}</span>
          ))}
        </div>
        <p className="text-xs text-uv-text mt-3 truncate">
          <span className="text-uv-text-muted">Servicio:</span> {activeServicio}
        </p>
      </div>

      {/* PODCAST INPUTS — solo si aplica */}
      {isPodcastPack && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-accent"><Mic className="w-4 h-4" /> Participants</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-uv-text-muted uppercase">Persona A (HOST)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Name" value={personaA.name} onChange={(e) => setPersonaA({ ...personaA, name: e.target.value })} className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent" />
                  <input placeholder="Expertise" value={personaA.expertise} onChange={(e) => setPersonaA({ ...personaA, expertise: e.target.value })} className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-uv-text-muted uppercase">Persona B (GUEST)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Name" value={personaB.name} onChange={(e) => setPersonaB({ ...personaB, name: e.target.value })} className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent" />
                  <input placeholder="Expertise" value={personaB.expertise} onChange={(e) => setPersonaB({ ...personaB, expertise: e.target.value })} className="bg-uv-bg border border-uv-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent" />
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2 text-accent"><Type className="w-4 h-4" /> Episode Brief</h3>
            <div className="space-y-2">
              <textarea value={episodeTheme} onChange={(e) => setEpisodeTheme(e.target.value)} className="w-full h-16 bg-uv-bg border border-uv-border rounded p-2 text-xs outline-none focus:border-accent resize-none" placeholder="Tema central del episodio..." />
              <textarea value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} className="w-full h-20 bg-uv-bg border border-uv-border rounded p-2 text-xs outline-none focus:border-accent resize-none" placeholder="Punto 1&#10;Punto 2..." />
            </div>
          </Card>
        </div>
      )}

      {/* GENERATE BUTTON */}
      <div className="flex items-center gap-4">
        <RunControlButton isLoading={isGenerating} onClick={handleRun} label="Generar Copy" />
        {outputs.length > 0 && isPodcastPack && (
          <Button variant="secondary" onClick={exportScriptJson} className="h-12 gap-2">
            <Download className="w-4 h-4" /> Exportar JSON
          </Button>
        )}
        {outputs.length > 0 && (
          <span className="text-xs text-uv-text-muted font-mono">{outputs.length} outputs generados</span>
        )}
      </div>

      {/* OUTPUTS */}
      <div className="space-y-4">
        {outputs.map((output) => {
          const speaker = getSpeakerForJob(output.metadata?.job_id);
          return (
            <Card key={output.id} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold">{output.label}</span>
                  {speaker && <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono uppercase border border-white/20">{speaker}</span>}
                  <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-mono uppercase">{output.channel}</span>
                  {output.metadata?.compliance_passed
                    ? <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono"><CheckCircle2 className="w-3 h-3" /> OK</span>
                    : <span className="flex items-center gap-1 text-[10px] text-rose-500 font-mono"><AlertCircle className="w-3 h-3" /> ISSUE</span>}
                </div>
                <Button variant="ghost" className="p-2" onClick={() => navigator.clipboard.writeText(output.content)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <textarea defaultValue={output.content}
                className="w-full h-40 bg-uv-bg/50 border border-uv-border rounded-lg p-4 text-sm leading-relaxed outline-none focus:border-accent/50 resize-none" />
              {output.metadata?.compliance_warnings?.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
                  <p className="text-[10px] font-bold text-rose-500 uppercase mb-1">Warnings</p>
                  <ul className="text-xs text-rose-400/80 list-disc list-inside">
                    {output.metadata.compliance_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
