import React, { useState } from 'react';
import { Card, Button, cn } from '../../ui/components';
import { useBrands } from '../../hooks/useBrands';
import { useChannelBlocks } from '../../hooks/useChannelBlocks';
import { useSessionStore } from '../../state/sessionStore';
import { validateCompliance, generateCopy } from '../../services/copyEngine';
import { Search, Zap, RefreshCw, Copy, CheckCircle2, AlertCircle, Wand2, Loader2 } from 'lucide-react';

type ToolId = 'analyzer' | 'cta' | 'adapter';

export const CopyToolsModule = () => {
  const [activeTool, setActiveTool] = useState<ToolId>('analyzer');

  return (
    <div className="space-y-8">
      <div className="flex gap-2 p-1 bg-uv-card border border-uv-border rounded-xl w-fit">
        <SubToolButton active={activeTool === 'analyzer'} onClick={() => setActiveTool('analyzer')} icon={Search} label="Analizador de Copy" />
        <SubToolButton active={activeTool === 'cta'} onClick={() => setActiveTool('cta')} icon={Zap} label="Generador de CTAs" />
        <SubToolButton active={activeTool === 'adapter'} onClick={() => setActiveTool('adapter')} icon={RefreshCw} label="Adaptador de Canal" />
      </div>
      <div className="min-h-[400px]">
        {activeTool === 'analyzer' && <CopyAnalyzerTool />}
        {activeTool === 'cta' && <CtaGeneratorTool />}
        {activeTool === 'adapter' && <ChannelAdapterTool />}
      </div>
    </div>
  );
};

const SubToolButton = ({ active, onClick, icon: Icon, label }: any) => (
  <button onClick={onClick} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
    active ? "bg-accent text-black" : "text-uv-text-muted hover:text-uv-text hover:bg-white/5")}>
    <Icon className="w-4 h-4" />{label}
  </button>
);

// ─── Analizador ───────────────────────────────────────────────
const CopyAnalyzerTool = () => {
  const { brands, loading: brandsLoading } = useBrands();
  const { activeBrandId, setActiveBrandId, sessionOutputs } = useSessionStore();
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  React.useEffect(() => {
    if (brands.length > 0 && !activeBrandId) setActiveBrandId(brands[0].id);
  }, [brands]);

  const loadLastOutput = () => {
    if (sessionOutputs.length > 0) setText(sessionOutputs[0].content);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const compliance = validateCompliance(text);
      const suggestions = await generateCopy({
        prompt: `Analiza este copy y sugiere 3 mejoras concretas para mejor conversión y alineación de marca:\n\n${text}`,
        systemPrompt: 'Eres experto en copywriting. Responde en español. Sé específico y accionable. Sin preámbulos.',
        temperature: 0.7,
      });
      setResult({ compliance, suggestions });
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Copy a analizar</label>
            {sessionOutputs.length > 0 && (
              <button onClick={loadLastOutput} className="text-[10px] font-mono text-accent hover:underline">
                ← Usar último output de CopyPack
              </button>
            )}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            className="w-full h-64 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
            placeholder="Pega aquí el copy que quieres revisar..." />
        </div>
        <div className="flex items-center justify-between">
          {brandsLoading ? (
            <div className="flex items-center gap-2 text-uv-text-muted text-sm"><Loader2 className="w-3 h-3 animate-spin" /></div>
          ) : (
            <select value={activeBrandId} onChange={(e) => setActiveBrandId(e.target.value)}
              className="bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <Button onClick={handleAnalyze} disabled={isAnalyzing || !text}>
            {isAnalyzing ? "Analizando..." : "Analizar"}
          </Button>
        </div>
      </div>
      <div className="space-y-6">
        {result && (
          <>
            <Card className="p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-accent" /> Compliance Check</h3>
              {result.compliance.passed ? (
                <div className="flex items-center gap-2 text-emerald-500 text-sm"><CheckCircle2 className="w-5 h-5" /> Sin problemas de compliance.</div>
              ) : (
                <ul className="space-y-2">
                  {result.compliance.warnings.map((w: string, i: number) => (
                    <li key={i} className="text-rose-400 text-sm flex gap-2"><span>•</span>{w}</li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Wand2 className="w-4 h-4 text-accent" /> Sugerencias de Mejora</h3>
              <div className="text-sm text-uv-text-muted leading-relaxed whitespace-pre-wrap">{result.suggestions}</div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

// ─── CTAs ─────────────────────────────────────────────────────
const CtaGeneratorTool = () => {
  const { activeBrandId } = useSessionStore();
  const { brands } = useBrands();
  const [objective, setObjective] = useState('');
  const [variants, setVariants] = useState(5);
  const [results, setResults] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const brandName = brands.find(b => b.id === activeBrandId)?.name || '';

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const content = await generateCopy({
        prompt: `Genera ${variants} CTAs de alta conversión${brandName ? ` para ${brandName}` : ''} con este objetivo: ${objective}.\n\nDevuelve SOLO una lista numerada, un CTA por línea. Sin explicaciones.`,
        systemPrompt: 'Eres experto en copywriting de conversión. Responde en español. SOLO la lista numerada.',
        temperature: 0.9,
      });
      setResults(content.split('\n').filter(l => l.trim()));
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Objetivo del CTA</label>
        <input type="text" value={objective} onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Que se registren a mi webinar gratuito sobre IA"
          className="w-full bg-uv-card border border-uv-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent" />
      </div>
      <div className="flex items-center gap-8">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Variantes: {variants}</label>
          <input type="range" min="5" max="20" step="5" value={variants}
            onChange={(e) => setVariants(parseInt(e.target.value))} className="w-full accent-accent" />
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating || !objective}>
          {isGenerating ? "Generando..." : "Generar CTAs"}
        </Button>
      </div>
      {results.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Resultados</h3>
            <Button variant="ghost" className="text-xs gap-2" onClick={() => navigator.clipboard.writeText(results.join('\n'))}>
              <Copy className="w-3 h-3" /> Copiar todo
            </Button>
          </div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="p-3 bg-white/5 rounded-lg text-sm hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => navigator.clipboard.writeText(r)}>{r}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Adaptador de Canal ───────────────────────────────────────
const ChannelAdapterTool = () => {
  const { blocks, loading: blocksLoading } = useChannelBlocks();
  const { sessionOutputs } = useSessionStore();
  const [text, setText] = useState('');
  const [targetChannelId, setTargetChannelId] = useState('');
  const [result, setResult] = useState('');
  const [isAdapting, setIsAdapting] = useState(false);

  React.useEffect(() => {
    if (blocks.length > 0 && !targetChannelId) setTargetChannelId(blocks[0].id);
  }, [blocks]);

  const loadLastOutput = () => {
    if (sessionOutputs.length > 0) setText(sessionOutputs[0].content);
  };

  const handleAdapt = async () => {
    setIsAdapting(true);
    try {
      const block = blocks.find(b => b.id === targetChannelId);
      if (!block) return;
      const charInfo = block.char_limit ? `Límite: ${block.char_limit} caracteres.` : '';
      const content = await generateCopy({
        prompt: `Adapta el siguiente copy para el canal "${block.name}".\n\nInstrucciones del canal: ${block.block_text || ''}\n${charInfo}\n\nCopy original:\n${text}`,
        systemPrompt: 'Eres experto en copywriting multicanal. Entrega SOLO el copy adaptado, sin explicaciones previas.',
        temperature: 0.8,
      });
      setResult(content);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAdapting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Copy Original</label>
            {sessionOutputs.length > 0 && (
              <button onClick={loadLastOutput} className="text-[10px] font-mono text-accent hover:underline">
                ← Usar último output de CopyPack
              </button>
            )}
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            className="w-full h-64 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
            placeholder="Pega aquí el copy que quieres adaptar..." />
        </div>
        <div className="flex items-center justify-between">
          {blocksLoading ? (
            <div className="flex items-center gap-2 text-uv-text-muted text-sm"><Loader2 className="w-3 h-3 animate-spin" /> Cargando canales...</div>
          ) : (
            <select value={targetChannelId} onChange={(e) => setTargetChannelId(e.target.value)}
              className="bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
              {blocks.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button onClick={handleAdapt} disabled={isAdapting || !text || blocksLoading}>
            {isAdapting ? "Adaptando..." : "Adaptar"}
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        {result && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Versión Adaptada</h3>
              <Button variant="ghost" className="p-2" onClick={() => navigator.clipboard.writeText(result)}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-sm text-uv-text-muted leading-relaxed whitespace-pre-wrap">{result}</div>
          </Card>
        )}
      </div>
    </div>
  );
};
