/**
 * UNRLVL CopyLab — CopyCustomizeModule.tsx
 * Updated: 2026-03-28d
 *   · FIX: step1, selectedSku, customText movidos al sessionStore
 *     → ya no se pierden al navegar entre pestañas
 *     → solo se limpian en reset explícito o cambio de marca/idioma
 * Updated: 2026-03-28b — Rediseño selector producto
 *   · Paso 1: Colección (líneas del catálogo) ó Servicio ó Texto libre
 *   · Paso 2: Producto específico (filtrado por colección seleccionada)
 *   · Idioma dinámico desde brand_languages
 *   · brand_services sin filtro de idioma
 */

import React from 'react';
import { Card, Button, cn } from '../../ui/components';
import { CopyOutputFormat, CopyTone } from '../../core/types';
import { COPY_PACKS } from '../../config/packs';
import { TONE_PRESETS } from '../../config/presets';
import { useBrands } from '../../hooks/useBrands';
import {
  useSessionStore,
  DEFAULT_CUSTOMIZE_OPTIONS,
  VARIANT_TEMPERATURE,
} from '../../state/sessionStore';
import {
  Settings2, Hash, ShieldCheck, Palette, FileText,
  Loader2, Info, ChevronRight, Package, Tag, Layers
} from 'lucide-react';
import type { BrandLanguage, BrandService, ProductBlueprint } from '../../lib/db/types';
import { fetchProductCatalog } from '../../lib/queries';

// ─── Inline hooks ──────────────────────────────────────────────
const SB_URL = import.meta.env.VITE_SUPABASE_URL as string
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const SB_HDR = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

function useBrandLanguages(brandId: string) {
  const [languages, setLanguages] = React.useState<BrandLanguage[]>([])
  React.useEffect(() => {
    if (!brandId) return
    fetch(`${SB_URL}/rest/v1/brand_languages?brand_id=eq.${encodeURIComponent(brandId)}&active=eq.true&order=is_primary.desc`, { headers: SB_HDR })
      .then(r => r.json()).then(setLanguages).catch(() => {})
  }, [brandId])
  return languages
}

function useBrandServices(brandId: string) {
  const [services, setServices] = React.useState<BrandService[]>([])
  const [loading, setLoading] = React.useState(false)
  React.useEffect(() => {
    if (!brandId) return
    setLoading(true)
    fetch(`${SB_URL}/rest/v1/brand_services?brand_id=eq.${encodeURIComponent(brandId)}&active=eq.true&order=item_type.asc,is_primary.desc`, { headers: SB_HDR })
      .then(r => r.json())
      .then(data => { setServices(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [brandId])
  return { services, loading }
}

// ─── Helpers ───────────────────────────────────────────────────

export function formatProductForPrompt(p: ProductBlueprint): string {
  return [
    `PRODUCTO: ${p.name}`,
    p.sku ? `SKU: ${p.sku}` : '',
    p.linea ? `Colección: ${p.linea}` : '',
    p.size ? `Presentación: ${p.size}` : '',
    p.description_es ?? p.description_en ?? '',
    p.benefit_claims?.length ? `Claims: ${p.benefit_claims.join(' · ')}` : '',
    p.hair_type?.length ? `Tipo de cabello: ${p.hair_type.join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

const LINE_LABELS: Record<string, string> = {
  Moisture: '💧 Moisture',
  Restore: '🔶 Restore',
  Styling: '✂️ Styling',
  Color_Rescue: '🟣 Color Rescue',
  Scalp: '🌿 Scalp',
  Pro_Salon: '⭐ Pro Salon',
}

// ─── Component ─────────────────────────────────────────────────
export const CopyCustomizeModule = () => {
  const { brands, loading: brandsLoading } = useBrands()

  const {
    activeBrandId, setActiveBrandId,
    activeLanguage, setActiveLanguage,
    activePackId, setActivePackId,
    activeServicio, setActiveServicio,
    activeKeywords, setActiveKeywords,
    activeTone, setActiveTone,
    activeOutputFormat, setActiveOutputFormat,
    activeExtraContext, setActiveExtraContext,
    customizeOptions, setCustomizeOptions,
    clearSessionOutputs,
    // FIX: selector de producto desde store (antes useState local → se perdía al navegar)
    activeStep1, setActiveStep1,
    activeSelectedSku, setActiveSelectedSku,
    activeCustomText, setActiveCustomText,
  } = useSessionStore()

  // ─── Catálogo (no necesita persistir — se recarga al montar) ──
  const [catalog, setCatalog] = React.useState<ProductBlueprint[]>([])
  const [catalogLoading, setCatalogLoading] = React.useState(false)

  // ─── Dynamic data ──────────────────────────────────────────────
  const languages = useBrandLanguages(activeBrandId ?? '')
  const { services, loading: servicesLoading } = useBrandServices(activeBrandId ?? '')

  // Líneas disponibles en este catálogo de marca
  const lines = React.useMemo(
    () => [...new Set(catalog.map(p => p.linea).filter(Boolean) as string[])].sort(),
    [catalog]
  )

  const pureServices = React.useMemo(
    () => services.filter(s => s.item_type === 'servicio'),
    [services]
  )

  const productsInLine = React.useMemo(
    () => activeStep1.startsWith('line:')
      ? catalog.filter(p => p.linea === activeStep1.replace('line:', ''))
      : [],
    [activeStep1, catalog]
  )

  // ─── Effects ───────────────────────────────────────────────────

  React.useEffect(() => {
    if (brands.length > 0 && !activeBrandId) setActiveBrandId(brands[0].id)
  }, [brands])

  React.useEffect(() => {
    if (!activePackId) setActivePackId(Object.keys(COPY_PACKS)[0])
  }, [])

  // Cuando cambia la marca: resetear selector y recargar catálogo
  React.useEffect(() => {
    setActiveStep1('')
    setActiveSelectedSku('')
    setActiveCustomText('')
    setCatalog([])
    if (!activeBrandId) return
    setCatalogLoading(true)
    fetchProductCatalog(activeBrandId)
      .then(data => { setCatalog(data); setCatalogLoading(false) })
      .catch(() => setCatalogLoading(false))
  }, [activeBrandId])

  // Recargar catálogo al montar (el catálogo no persiste, solo el estado del selector)
  React.useEffect(() => {
    if (!activeBrandId) return
    setCatalogLoading(true)
    fetchProductCatalog(activeBrandId)
      .then(data => { setCatalog(data); setCatalogLoading(false) })
      .catch(() => setCatalogLoading(false))
  }, [])

  // Cuando cambia idioma: resetear selector de producto/servicio
  React.useEffect(() => {
    setActiveStep1('')
    setActiveSelectedSku('')
  }, [activeLanguage])

  // Sincronizar activeServicio al store
  React.useEffect(() => {
    if (activeStep1 === '__custom__') {
      setActiveServicio(activeCustomText)
      return
    }
    if (activeStep1.startsWith('svc:')) {
      const svc = pureServices.find(s => s.id === activeStep1.replace('svc:', ''))
      setActiveServicio(svc?.servicio ?? '')
      return
    }
    if (activeStep1.startsWith('line:') && activeSelectedSku) {
      const product = catalog.find(p => p.sku === activeSelectedSku)
      setActiveServicio(product?.name ?? '')
      return
    }
    if (activeStep1.startsWith('line:') && !activeSelectedSku) {
      const lineName = activeStep1.replace('line:', '')
      setActiveServicio(`Colección ${lineName}`)
      return
    }
    setActiveServicio('')
  }, [activeStep1, activeSelectedSku, activeCustomText, pureServices, catalog])

  // Inyectar datos del producto en extraContext cuando se elige un SKU
  React.useEffect(() => {
    if (!activeSelectedSku) return
    const product = catalog.find(p => p.sku === activeSelectedSku)
    if (product && !activeExtraContext) {
      setActiveExtraContext(formatProductForPrompt(product))
    }
  }, [activeSelectedSku, catalog])

  // ─── Handlers ──────────────────────────────────────────────────
  const handleStep1Change = (value: string) => {
    setActiveStep1(value)
    setActiveSelectedSku('')
    if (value !== '__custom__') setActiveCustomText('')
  }

  const handleReset = () => {
    setCustomizeOptions(DEFAULT_CUSTOMIZE_OPTIONS)
    clearSessionOutputs()
    setActiveStep1('')
    setActiveSelectedSku('')
    setActiveCustomText('')
  }

  const isReady = !!activeBrandId && !!activeServicio.trim()
  const selectedProduct = catalog.find(p => p.sku === activeSelectedSku) ?? null

  return (
    <div className="max-w-3xl space-y-8">

      {/* HELP BANNER */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-accent">Empieza aquí</p>
          <p className="text-xs text-uv-text-muted leading-relaxed">
            Configura marca, idioma y producto/servicio. Todo aplica automáticamente en <strong className="text-uv-text">CopyPack</strong> y <strong className="text-uv-text">Tools</strong>.
          </p>
          {!isReady && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" /> Elige una marca y un producto/servicio para comenzar.
            </p>
          )}
        </div>
      </div>

      {/* 1. MARCA + IDIOMA + PACK */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Contexto de campaña
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Marca</label>
            {brandsLoading ? (
              <div className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-uv-text-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
              </div>
            ) : (
              <select value={activeBrandId} onChange={e => setActiveBrandId(e.target.value)}
                className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Idioma</label>
            <select value={activeLanguage} onChange={e => setActiveLanguage(e.target.value as any)}
              className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
              {languages.length > 0 ? (
                languages.map(l => (
                  <option key={l.id} value={l.idioma_id}>
                    {l.descripcion ?? l.idioma_id}{l.is_primary ? ' ★' : ''}
                  </option>
                ))
              ) : (
                <>
                  <option value="ES">Español (ES)</option>
                  <option value="es-FL">Español (Florida)</option>
                  <option value="SPANG">Spanglish</option>
                  <option value="EN">English</option>
                </>
              )}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Pack</label>
            <select value={activePackId} onChange={e => setActivePackId(e.target.value)}
              className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
              {Object.values(COPY_PACKS).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* 2. PRODUCTO / SERVICIO */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Package className="w-4 h-4" /> Producto / Servicio
          <span className="text-rose-400 text-[10px]">requerido</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* PASO 1 — Colección o Servicio */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3 h-3" /> Colección / Servicio
            </label>
            {catalogLoading || servicesLoading ? (
              <div className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-uv-text-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
              </div>
            ) : (
              <select
                value={activeStep1}
                onChange={e => handleStep1Change(e.target.value)}
                className={cn(
                  "w-full bg-uv-card border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors",
                  !activeStep1 ? "border-amber-500/40" : "border-uv-border"
                )}
              >
                <option value="">— Elige —</option>

                {lines.length > 0 && (
                  <optgroup label="📦 Colecciones">
                    {lines.map(linea => (
                      <option key={linea} value={`line:${linea}`}>
                        {LINE_LABELS[linea] ?? linea}
                      </option>
                    ))}
                  </optgroup>
                )}

                {pureServices.length > 0 && (
                  <optgroup label="🔧 Servicios">
                    {pureServices.map(s => (
                      <option key={s.id} value={`svc:${s.id}`}>
                        {s.servicio ?? s.producto}
                      </option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="✏️ Personalizado">
                  <option value="__custom__">Otro (texto libre)...</option>
                </optgroup>
              </select>
            )}
          </div>

          {/* PASO 2 — Producto específico */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider flex items-center gap-1">
              <Tag className="w-3 h-3" /> Producto
              <span className="text-uv-text-muted normal-case font-normal text-[10px]">(opcional)</span>
            </label>
            {activeStep1.startsWith('line:') ? (
              <select
                value={activeSelectedSku}
                onChange={e => setActiveSelectedSku(e.target.value)}
                className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">— Copy general de colección —</option>
                {productsInLine.map(p => (
                  <option key={p.id} value={p.sku ?? p.id}>
                    {p.name}{p.size ? ` · ${p.size}` : ''}{p.b2b_only ? ' · PRO' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full bg-uv-card/40 border border-uv-border/50 rounded-lg px-3 py-2 text-sm text-uv-text-muted italic">
                {activeStep1 ? 'No aplica' : 'Elige una colección primero'}
              </div>
            )}
          </div>
        </div>

        {/* Texto libre */}
        {activeStep1 === '__custom__' && (
          <input
            type="text"
            value={activeCustomText}
            onChange={e => setActiveCustomText(e.target.value)}
            placeholder="e.g. Shampoo anticaída · Tratamiento de keratina · Servicio B2B"
            autoFocus
            className={cn(
              "w-full bg-uv-card border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors",
              !activeCustomText.trim() ? "border-amber-500/40" : "border-uv-border"
            )}
          />
        )}

        {/* Preview del producto seleccionado */}
        {selectedProduct && (
          <div className="bg-uv-card border border-accent/20 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-accent">{selectedProduct.name}</span>
              {selectedProduct.sku && <span className="text-[10px] text-uv-text-muted font-mono">{selectedProduct.sku}</span>}
            </div>
            {selectedProduct.description_es && (
              <p className="text-xs text-uv-text-muted line-clamp-2">{selectedProduct.description_es}</p>
            )}
            {selectedProduct.benefit_claims?.length ? (
              <p className="text-xs text-uv-text-muted">
                {selectedProduct.benefit_claims.slice(0, 3).join(' · ')}
              </p>
            ) : null}
          </div>
        )}

        {/* Contexto adicional */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">
            Contexto adicional <span className="text-uv-text-muted normal-case">(opcional)</span>
          </label>
          <textarea
            value={activeExtraContext}
            onChange={e => setActiveExtraContext(e.target.value)}
            placeholder="Detalles adicionales sobre la campaña, oferta, momento, público objetivo específico..."
            className="w-full h-20 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
          />
        </div>

        {/* Keywords adicionales */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">
            Keywords adicionales <span className="text-uv-text-muted normal-case">(opcional — separadas por coma)</span>
          </label>
          <input
            type="text"
            value={activeKeywords}
            onChange={e => setActiveKeywords(e.target.value)}
            placeholder="keyword1, keyword2, keyword3"
            className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
      </section>

      {/* 3. TONO + FORMATO */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <FileText className="w-4 h-4" /> Tono y Formato
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Tono</label>
            <select value={activeTone} onChange={e => setActiveTone(e.target.value as CopyTone)}
              className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
              {TONE_PRESETS.map(t => <option key={t.id} value={t.id}>{t.label} — {t.description}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Formato</label>
            <div className="grid grid-cols-4 gap-2">
              {(['markdown', 'plain', 'json', 'html'] as CopyOutputFormat[]).map(f => (
                <button key={f} onClick={() => setActiveOutputFormat(f)}
                  className={cn("px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                    activeOutputFormat === f ? "bg-accent border-accent text-black" : "bg-uv-card border-uv-border text-uv-text-muted hover:border-accent/50")}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. SOCIAL OPTIONS */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Hash className="w-4 h-4" /> Social Options
        </h3>
        <Card className="p-5 space-y-5">
          {[
            { key: 'include_hashtags', label: 'Incluir Hashtags', desc: 'Genera hashtags relevantes automáticamente.' },
            { key: 'include_emojis', label: 'Incluir Emojis', desc: 'Añade emojis para mejorar el engagement visual.' },
            { key: 'include_cta', label: 'Incluir CTA', desc: 'Añade llamada a la acción al final.' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div><p className="text-sm font-bold">{label}</p><p className="text-xs text-uv-text-muted">{desc}</p></div>
              <Toggle
                active={customizeOptions[key as keyof typeof customizeOptions] as boolean}
                onToggle={v => setCustomizeOptions({ [key]: v })}
              />
            </div>
          ))}
        </Card>
      </section>

      {/* 5. COMPLIANCE + VARIANT STYLE */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Compliance y Creatividad
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Compliance Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {(['strict', 'standard'] as const).map(m => (
                <button key={m} onClick={() => setCustomizeOptions({ compliance_mode: m })}
                  className={cn("px-3 py-3 rounded-xl border text-left transition-all",
                    customizeOptions.compliance_mode === m ? "bg-accent/10 border-accent" : "bg-uv-card border-uv-border hover:border-accent/50")}>
                  <p className={cn("text-xs font-bold uppercase", customizeOptions.compliance_mode === m ? "text-accent" : "text-uv-text")}>{m}</p>
                  <p className="text-[10px] text-uv-text-muted mt-0.5">{m === 'strict' ? "Bloquea si hay warnings." : "Advierte pero genera."}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-3 h-3" /> Variant Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'balanced', 'creative'] as const).map(s => (
                <button key={s} onClick={() => setCustomizeOptions({ variant_style: s })}
                  className={cn("px-2 py-3 rounded-xl border text-xs font-medium text-center transition-all",
                    customizeOptions.variant_style === s ? "bg-accent border-accent text-black" : "bg-uv-card border-uv-border text-uv-text-muted hover:border-accent/50")}>
                  {s.toUpperCase()}
                  <div className="text-[9px] mt-0.5 opacity-70">t={VARIANT_TEMPERATURE[s]}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. EXTRA INSTRUCTIONS */}
      <section className="space-y-4">
        <h3 className="text-sm font-mono text-uv-text-muted uppercase tracking-widest flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Extra Instructions
        </h3>
        <textarea
          value={customizeOptions.extra_notes}
          onChange={e => setCustomizeOptions({ extra_notes: e.target.value })}
          placeholder="Instrucciones adicionales que aplican a todas las generaciones de esta sesión..."
          className="w-full h-28 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
        />
      </section>

      {/* RESET */}
      <div className="flex items-center justify-between pt-2 border-t border-uv-border">
        <p className="text-xs text-uv-text-muted">La configuración persiste durante la sesión del browser.</p>
        <Button variant="ghost" onClick={handleReset} className="text-xs text-uv-text-muted">Limpiar sesión</Button>
      </div>
    </div>
  )
}

const Toggle = ({ active, onToggle }: { active: boolean; onToggle: (v: boolean) => void }) => (
  <button onClick={() => onToggle(!active)}
    className={cn("w-10 h-5 rounded-full relative transition-colors shrink-0", active ? "bg-accent" : "bg-uv-border")}>
    <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", active ? "right-1" : "left-1")} />
  </button>
)
