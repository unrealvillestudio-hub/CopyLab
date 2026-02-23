import React, { useState } from 'react';
import { Card, Button, cn } from '../../ui/components';
import { BRANDS } from '../../config/brands';
import { CHANNEL_BLOCKS } from '../../config/channelBlocks';
import { TONE_PRESETS } from '../../config/presets';
import { validateCompliance, generateCopy } from '../../services/copyEngine';
import { Search, Zap, RefreshCw, Copy, CheckCircle2, AlertCircle, Wand2 } from 'lucide-react';

type ToolId = 'analyzer' | 'cta' | 'adapter';

export const CopyToolsModule = () => {
  const [activeTool, setActiveTool] = useState<ToolId>('analyzer');

  return (
    <div className="space-y-8">
      <div className="flex gap-2 p-1 bg-uv-card border border-uv-border rounded-xl w-fit">
        <SubToolButton 
          active={activeTool === 'analyzer'} 
          onClick={() => setActiveTool('analyzer')}
          icon={Search}
          label="Analizador de Copy"
        />
        <SubToolButton 
          active={activeTool === 'cta'} 
          onClick={() => setActiveTool('cta')}
          icon={Zap}
          label="Generador de CTAs"
        />
        <SubToolButton 
          active={activeTool === 'adapter'} 
          onClick={() => setActiveTool('adapter')}
          icon={RefreshCw}
          label="Adaptador de Canal"
        />
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
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
      active 
        ? "bg-accent text-black" 
        : "text-uv-text-muted hover:text-uv-text hover:bg-white/5"
    )}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const CopyAnalyzerTool = () => {
  const [text, setText] = useState('');
  const [brandId, setBrandId] = useState(BRANDS[0].id);
  const [result, setResult] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    const compliance = validateCompliance(text, "");
    const suggestions = await generateCopy({
      prompt: `Analyze this copy and suggest 3 improvements for better conversion and brand alignment: \n\n ${text}`,
      outputFormat: "markdown"
    });
    setResult({ compliance, suggestions });
    setIsAnalyzing(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Copy a analizar</label>
          <textarea 
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-64 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
            placeholder="Pega aquí el copy que quieres revisar..."
          />
        </div>
        <div className="flex items-center justify-between">
          <select 
            value={brandId} 
            onChange={(e) => setBrandId(e.target.value)}
            className="bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {BRANDS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Button onClick={handleAnalyze} disabled={isAnalyzing || !text}>
            {isAnalyzing ? "Analizando..." : "Analizar"}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {result && (
          <>
            <Card className="p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-accent" />
                Compliance Check
              </h3>
              {result.compliance.passed ? (
                <div className="flex items-center gap-2 text-emerald-500 text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  No se encontraron problemas de compliance.
                </div>
              ) : (
                <ul className="space-y-2">
                  {result.compliance.warnings.map((w: string, i: number) => (
                    <li key={i} className="text-rose-400 text-sm flex gap-2">
                      <span className="shrink-0">•</span> {w}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-accent" />
                Sugerencias de Mejora
              </h3>
              <div className="text-sm text-uv-text-muted leading-relaxed whitespace-pre-wrap">
                {result.suggestions}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

const CtaGeneratorTool = () => {
  const [objective, setObjective] = useState('');
  const [variants, setVariants] = useState(5);
  const [results, setResults] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    const prompt = `Generate ${variants} high-converting call-to-action (CTA) phrases for: ${objective}. List them as a numbered list.`;
    const content = await generateCopy({ prompt, outputFormat: "plain" });
    setResults(content.split('\n').filter(l => l.trim()));
    setIsGenerating(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Objetivo del CTA</label>
        <input 
          type="text"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Que se registren a mi webinar gratuito sobre IA"
          className="w-full bg-uv-card border border-uv-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-8">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Variantes: {variants}</label>
          <input 
            type="range" min="5" max="20" step="5" 
            value={variants} 
            onChange={(e) => setVariants(parseInt(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating || !objective}>
          Generar CTAs
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
              <div key={i} className="p-3 bg-white/5 rounded-lg text-sm hover:bg-white/10 transition-colors">
                {r}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

const ChannelAdapterTool = () => {
  const [text, setText] = useState('');
  const [targetChannel, setTargetChannel] = useState(Object.keys(CHANNEL_BLOCKS)[0]);
  const [result, setResult] = useState('');
  const [isAdapting, setIsAdapting] = useState(false);

  const handleAdapt = async () => {
    setIsAdapting(true);
    const block = CHANNEL_BLOCKS[targetChannel as any];
    const prompt = `Rewrite the following copy to adapt it for ${block.label}. \nRules: ${block.restrictions.join('. ')} \nMax length: ${block.maxLength} characters. \n\nOriginal: ${text}`;
    const content = await generateCopy({ prompt, outputFormat: "markdown" });
    setResult(content);
    setIsAdapting(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Copy Original</label>
          <textarea 
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-64 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
            placeholder="Pega aquí el copy que quieres adaptar..."
          />
        </div>
        <div className="flex items-center justify-between">
          <select 
            value={targetChannel} 
            onChange={(e) => setTargetChannel(e.target.value)}
            className="bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {Object.values(CHANNEL_BLOCKS).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Button onClick={handleAdapt} disabled={isAdapting || !text}>
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
            <div className="text-sm text-uv-text-muted leading-relaxed whitespace-pre-wrap">
              {result}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
