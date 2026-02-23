import React, { useState, useEffect } from 'react';
import { Card, Button, cn } from '../../ui/components';
import { CopyOutputFormat } from '../../core/types';
import { DEFAULT_CUSTOMIZE_OPTIONS, CustomizeOptions } from '../../config/customizeOutputs';
import { Settings2, Hash, Smile, ShieldCheck, Palette, FileText } from 'lucide-react';

export const CopyCustomizeModule = () => {
  const [options, setOptions] = useState<CustomizeOptions>(() => {
    const saved = localStorage.getItem('copylab_customize');
    return saved ? JSON.parse(saved) : DEFAULT_CUSTOMIZE_OPTIONS;
  });

  useEffect(() => {
    localStorage.setItem('copylab_customize', JSON.stringify(options));
  }, [options]);

  const updateOption = (key: keyof CustomizeOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-3xl space-y-8">
      {/* 1. OUTPUT FORMAT */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-4 h-4" /> Output Format
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['markdown', 'plain', 'json', 'html'].map((f) => (
            <button
              key={f}
              onClick={() => updateOption('output_format', f)}
              className={cn(
                "px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                options.output_format === f 
                  ? "bg-accent border-accent text-black" 
                  : "bg-uv-card border-uv-border text-uv-text-muted hover:border-accent/50"
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* 2. SOCIAL OPTIONS */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Hash className="w-4 h-4" /> Social Options
        </h3>
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-bold">Incluir Hashtags</p>
              <p className="text-xs text-uv-text-muted">Genera automáticamente hashtags relevantes.</p>
            </div>
            <Toggle 
              active={options.include_hashtags} 
              onToggle={(v) => updateOption('include_hashtags', v)} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-bold">Incluir Emojis</p>
              <p className="text-xs text-uv-text-muted">Añade emojis para mejorar el engagement visual.</p>
            </div>
            <Toggle 
              active={options.include_emojis} 
              onToggle={(v) => updateOption('include_emojis', v)} 
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-bold">Incluir CTA</p>
              <p className="text-xs text-uv-text-muted">Añade una llamada a la acción al final.</p>
            </div>
            <Toggle 
              active={options.include_cta} 
              onToggle={(v) => updateOption('include_cta', v)} 
            />
          </div>
        </Card>
      </section>

      {/* 3. COMPLIANCE MODE */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Compliance Mode
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {['strict', 'standard'].map((m) => (
            <button
              key={m}
              onClick={() => updateOption('compliance_mode', m)}
              className={cn(
                "px-4 py-4 rounded-xl border text-left transition-all",
                options.compliance_mode === m 
                  ? "bg-accent/10 border-accent" 
                  : "bg-uv-card border-uv-border hover:border-accent/50"
              )}
            >
              <p className={cn("text-sm font-bold uppercase", options.compliance_mode === m ? "text-accent" : "text-uv-text")}>
                {m}
              </p>
              <p className="text-xs text-uv-text-muted mt-1">
                {m === 'strict' ? "Bloquea generación si hay warnings." : "Advierte pero permite generar."}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* 4. VARIANT STYLE */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Palette className="w-4 h-4" /> Variant Style
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {['conservative', 'balanced', 'creative'].map((s) => (
            <button
              key={s}
              onClick={() => updateOption('variant_style', s)}
              className={cn(
                "px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                options.variant_style === s 
                  ? "bg-accent border-accent text-black" 
                  : "bg-uv-card border-uv-border text-uv-text-muted hover:border-accent/50"
              )}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* 5. EXTRA NOTES */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Extra Instructions
        </h3>
        <textarea 
          placeholder="Añade aquí cualquier instrucción adicional que deba aplicarse a todas las generaciones..."
          className="w-full h-32 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
        />
      </section>
    </div>
  );
};

const Toggle = ({ active, onToggle }: { active: boolean, onToggle: (v: boolean) => void }) => (
  <button 
    onClick={() => onToggle(!active)}
    className={cn(
      "w-10 h-5 rounded-full relative transition-colors",
      active ? "bg-accent" : "bg-uv-border"
    )}
  >
    <div className={cn(
      "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
      active ? "right-1" : "left-1"
    )} />
  </button>
);
