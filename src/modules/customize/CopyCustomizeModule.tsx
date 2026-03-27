import React, { useState, useEffect } from 'react';
import { Card, Button, cn } from '../../ui/components';
import { CopyOutputFormat } from '../../core/types';
import { useSessionStore } from '../../state/sessionStore';
import { useBrands } from '../../hooks/useBrands';
import { Settings2, Hash, ShieldCheck, Palette, FileText, Loader2 } from 'lucide-react';

interface CustomizeOptions {
  output_format: CopyOutputFormat
  include_hashtags: boolean
  include_emojis: boolean
  include_cta: boolean
  compliance_mode: 'strict' | 'standard'
  variant_style: 'conservative' | 'balanced' | 'creative'
  extra_notes: string
}

const DEFAULT_OPTIONS: CustomizeOptions = {
  output_format: 'markdown',
  include_hashtags: true,
  include_emojis: true,
  include_cta: true,
  compliance_mode: 'standard',
  variant_style: 'balanced',
  extra_notes: '',
}

export const CopyCustomizeModule = () => {
  const { brands, loading: brandsLoading } = useBrands();
  const {
    activeBrandId, setActiveBrandId,
    activeLanguage, setActiveLanguage,
    activeTone, setActiveTone,
    activeOutputFormat, setActiveOutputFormat,
  } = useSessionStore();

  const [options, setOptions] = useState<CustomizeOptions>(() => {
    try {
      const saved = localStorage.getItem('copylab_customize');
      return saved ? JSON.parse(saved) : DEFAULT_OPTIONS;
    } catch { return DEFAULT_OPTIONS; }
  });

  useEffect(() => {
    localStorage.setItem('copylab_customize', JSON.stringify(options));
  }, [options]);

  // Sync output format with session store
  useEffect(() => {
    setActiveOutputFormat(options.output_format);
  }, [options.output_format]);

  React.useEffect(() => {
    if (brands.length > 0 && !activeBrandId) setActiveBrandId(brands[0].id);
  }, [brands]);

  const update = (key: keyof CustomizeOptions, value: any) =>
    setOptions(prev => ({ ...prev, [key]: value }));

  return (
    <div className="max-w-3xl space-y-8">

      {/* MARCA ACTIVA */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Marca Activa (Global)
        </h3>
        <p className="text-xs text-uv-text-muted">La marca seleccionada aquí aplica a todos los módulos de CopyLab durante esta sesión.</p>
        {brandsLoading ? (
          <div className="flex items-center gap-2 text-uv-text-muted text-sm"><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</div>
        ) : (
          <select value={activeBrandId} onChange={(e) => setActiveBrandId(e.target.value)}
            className="w-full max-w-xs bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </section>

      {/* OUTPUT FORMAT */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-4 h-4" /> Output Format
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['markdown', 'plain', 'json', 'html'] as CopyOutputFormat[]).map((f) => (
            <button key={f} onClick={() => update('output_format', f)}
              className={cn("px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                options.output_format === f ? "bg-accent border-accent text-black" : "bg-uv-card border-uv-border text-uv-text-muted hover:border-accent/50")}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* SOCIAL OPTIONS */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Hash className="w-4 h-4" /> Social Options
        </h3>
        <Card className="p-6 space-y-6">
          {[
            { key: 'include_hashtags', label: 'Incluir Hashtags', desc: 'Genera automáticamente hashtags relevantes.' },
            { key: 'include_emojis', label: 'Incluir Emojis', desc: 'Añade emojis para mejorar el engagement visual.' },
            { key: 'include_cta', label: 'Incluir CTA', desc: 'Añade una llamada a la acción al final.' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-bold">{label}</p>
                <p className="text-xs text-uv-text-muted">{desc}</p>
              </div>
              <Toggle active={options[key as keyof CustomizeOptions] as boolean}
                onToggle={(v) => update(key as keyof CustomizeOptions, v)} />
            </div>
          ))}
        </Card>
      </section>

      {/* COMPLIANCE MODE */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Compliance Mode
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {(['strict', 'standard'] as const).map((m) => (
            <button key={m} onClick={() => update('compliance_mode', m)}
              className={cn("px-4 py-4 rounded-xl border text-left transition-all",
                options.compliance_mode === m ? "bg-accent/10 border-accent" : "bg-uv-card border-uv-border hover:border-accent/50")}>
              <p className={cn("text-sm font-bold uppercase", options.compliance_mode === m ? "text-accent" : "text-uv-text")}>{m}</p>
              <p className="text-xs text-uv-text-muted mt-1">
                {m === 'strict' ? "Bloquea generación si hay warnings." : "Advierte pero permite generar."}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* VARIANT STYLE */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Palette className="w-4 h-4" /> Variant Style
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {(['conservative', 'balanced', 'creative'] as const).map((s) => (
            <button key={s} onClick={() => update('variant_style', s)}
              className={cn("px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                options.variant_style === s ? "bg-accent border-accent text-black" : "bg-uv-card border-uv-border text-uv-text-muted hover:border-accent/50")}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* EXTRA INSTRUCTIONS */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Extra Instructions
        </h3>
        <textarea value={options.extra_notes} onChange={(e) => update('extra_notes', e.target.value)}
          placeholder="Instrucciones adicionales que aplican a todas las generaciones de esta sesión..."
          className="w-full h-32 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none" />
      </section>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => { setOptions(DEFAULT_OPTIONS); localStorage.removeItem('copylab_customize'); }}
          className="text-xs text-uv-text-muted">Restaurar defaults</Button>
      </div>
    </div>
  );
};

const Toggle = ({ active, onToggle }: { active: boolean; onToggle: (v: boolean) => void }) => (
  <button onClick={() => onToggle(!active)}
    className={cn("w-10 h-5 rounded-full relative transition-colors", active ? "bg-accent" : "bg-uv-border")}>
    <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", active ? "right-1" : "left-1")} />
  </button>
);
