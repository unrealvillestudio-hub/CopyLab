/**
 * UNRLVL CopyLab — CopyCustomizeModule.tsx
 * Panel de configuración global — PRIMER TAB.
 * Updated: 2026-03-28
 *   · Idioma: dinámico desde brand_languages (fallback hardcoded)
 *   · Servicio: selector dinámico con <optgroup> por item_type
 *   · SKU: selector condicional cuando item_type = 'producto' | 'ambos'
 */

import React from 'react';
import { Card, Button, cn } from '../../ui/components';
import { CopyOutputFormat, CopyTone } from '../../core/types';
import { COPY_PACKS } from '../../config/packs';
import { TONE_PRESETS, FORMAT_PRESETS } from '../../config/presets';
import { useBrands } from '../../hooks/useBrands';
import {
  useSessionStore,
  DEFAULT_CUSTOMIZE_OPTIONS,
  VARIANT_TEMPERATURE,
} from '../../state/sessionStore';
import {
  Settings2, Hash, ShieldCheck, Palette, FileText,
  Loader2, Info, ChevronRight, Package, Tag
} from 'lucide-react';
import type { BrandLanguage, BrandService, ProductBlueprint } from '../../lib/db/types';
import { fetchProductCatalog } from '../../lib/queries';

// ─── Inline hooks — Supabase fetch ─────────────────────────────

const SB_URL  = import.meta.env.VITE_SUPABASE_URL as string
const SB_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const SB_HDR  = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

function useBrandLanguages(brandId: string) {
  const [languages, setLanguages] = React.useState<BrandLanguage[]>([])
  const [loading, setLoading] = React.useState(false)
  React.useEffect(() => {
    if (!brandId) return
    setLoading(true)
    fetch(
      `${SB_URL}/rest/v1/brand_languages?brand_id=eq.${encodeURIComponent(brandId)}&active=eq.true&order=is_primary.desc`,
      { headers: SB_HDR }
    )
      .then(r => r.json())
      .then((data: BrandLanguage[]) => { setLanguages(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [brandId])
  return { languages, loading }
}

function useBrandServices(brandId: string, idioma: string) {
  const [services, setServices] = React.useState<BrandService[]>([])
  const [loading, setLoading] = React.useState(false)
  React.useEffect(() => {
    if (!brandId) return
    setLoading(true)
    let path = `${SB_URL}/rest/v1/brand_services?brand_id=eq.${encodeURIComponent(brandId)}&active=eq.true&order=item_type.asc,is_primary.desc`
    if (idioma) path += `&idioma=eq.${encodeURIComponent(idioma)}`
    fetch(path, { headers: SB_HDR })
      .then(r => r.json())
      .then((data: BrandService[]) => { setServices(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [brandId, idioma])
  return { services, loading }
}

// ─── Helpers ───────────────────────────────────────────────────

/** Etiquetas para <optgroup> de item_type */
const ITEM_TYPE_LABELS: Record<string, string> = {
  producto: '📦 Productos',
  servicio: '🔧 Servicios',
  ambos:    '📦 Productos / Servicios',
}

/** Agrupa servicios por item_type */
function groupByItemType(services: BrandService[]): Record<string, BrandService[]> {
  return services.reduce((acc, s) => {
    const key = s.item_type ?? 'servicio'
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {} as Record<string, BrandService[]>)
}

/** Verifica si el item_type seleccionado incluye productos */
function isProductType(itemType: string | undefined): boolean {
  return itemType === 'producto' || itemType === 'ambos'
}

/** Formatea los datos de un producto para inyección en el prompt */
export function formatProductForPrompt(p: ProductBlueprint): string {
  const lines: string[] = [
    `PRODUCTO: ${p.name}`,
    p.sku ? `SKU: ${p.sku}` : '',
    p.linea ? `Línea: ${p.linea}` : '',
    p.size ? `Presentación: ${p.size}` : '',
    p.description_es ?? p.description_en ?? '',
    p.benefit_claims?.length
      ? `Claims: ${p.benefit_claims.join(' · ')}`
      : '',
    p.hair_type?.length
      ? `Tipo de cabello: ${p.hair_type.join(', ')}`
      : '',
  ]
  return lines.filter(Boolean).join('\n')
}

// ─── Component ─────────────────────────────────────────────────

export const CopyCustomizeModule = () => {
  const { brands, loading: brandsLoading } = useBrands();

  const {
    activeBrandId,      setActiveBrandId,
    activeLanguage,     setActiveLanguage,
    activePackId,       setActivePackId,
    activeServicio,     setActiveServicio,
    activeKeywords,     setActiveKeywords,
    activeTone,         setActiveTone,
    activeOutputFormat, setActiveOutputFormat,
    activeExtraContext, setActiveExtraContext,
    customizeOptions,   setCustomizeOptions,
    clearSessionOutputs,
  } = useSessionStore();

  // ─── Selección de producto/SKU (local — no persiste entre sesiones) ─
  const [selectedServiceId, setSelectedServiceId]     = React.useState<string>('')
  const [selectedServiceType, setSelectedServiceType] = React.useState<string>('')
  const [selectedSku, setSelectedSku]                 = React.useState<string>('')
  const [productCatalog, setProductCatalog]           = React.useState<ProductBlueprint[]>([])
  const [productsLoading, setProductsLoading]         = React.useState(false)
  const [customServicioText, setCustomServicioText]   = React.useState('')
  const [useCustomServicio, setUseCustomServicio]      = React.useState(false)

  // ─── Dynamic data ─────────────────────────────────────────────
  const { languages } = useBrandLanguages(activeBrandId ?? '')
  const { services, loading: servicesLoading } = useBrandServices(
    activeBrandId ?? '',
    activeLanguage ?? ''
  )

  // ─── Effects ──────────────────────────────────────────────────

  // Set defaults once brands load
  React.useEffect(() => {
    if (brands.length > 0 && !activeBrandId) setActiveBrandId(brands[0].id);
  }, [brands]);

  React.useEffect(() => {
    if (!activePackId) setActivePackId(Object.keys(COPY_PACKS)[0]);
  }, []);

  // When brand changes → reset service + SKU selections
  React.useEffect(() => {
    setSelectedServiceId('')
    setSelectedServiceType('')
    setSelectedSku('')
    setProductCatalog([])
    setUseCustomServicio(false)
    setCustomServicioText('')
  }, [activeBrandId])

  // When idioma changes → reset service + SKU selections
  React.useEffect(() => {
    setSelectedServiceId('')
    setSelectedServiceType('')
    setSelectedSku('')
    setProductCatalog([])
  }, [activeLanguage])

  // When a service with product type is selected → load product catalog
  React.useEffect(() => {
    if (!activeBrandId || !isProductType(selectedServiceType)) {
      setProductCatalog([])
      setSelectedSku('')
      return
    }
    setProductsLoading(true)
    fetchProductCatalog(activeBrandId)
      .then(data => {
        // Exclude b2b_only unless brand context allows it
        setProductCatalog(data.filter(p => p.shopify_visibility !== 'hidden'))
        setProductsLoading(false)
      })
      .catch(() => setProductsLoading(false))
  }, [activeBrandId, selectedServiceType])

  // Sync activeServicio to store when selections change
  React.useEffect(() => {
    if (useCustomServicio) {
      setActiveServicio(customServicioText)
      return
    }
    const svc = services.find(s => s.id === selectedServiceId)
    if (svc) {
      const product = productCatalog.find(p => p.sku === selectedSku)
      setActiveServicio(
        product ? `${svc.servicio ?? ''} — ${product.name}` : (svc.servicio ?? '')
      )
    }
  }, [selectedServiceId, selectedSku, useCustomServicio, customServicioText, services, productCatalog])

  // ─── Handlers ─────────────────────────────────────────────────

  const handleServiceChange = (value: string) => {
    if (value === '__custom__') {
      setUseCustomServicio(true)
      setSelectedServiceId('')
      setSelectedServiceType('')
      setSelectedSku('')
      return
    }
    setUseCustomServicio(false)
    setSelectedServiceId(value)
    const svc = services.find(s => s.id === value)
    setSelectedServiceType(svc?.item_type ?? 'servicio')
    setSelectedSku('')
  }

  const handleSkuChange = (sku: string) => {
    setSelectedSku(sku)
    // Inject product description into extra context
    const product = productCatalog.find(p => p.sku === sku)
    if (product && !activeExtraContext) {
      setActiveExtraContext(formatProductForPrompt(product))
    }
  }

  const handleReset = () => {
    setCustomizeOptions(DEFAULT_CUSTOMIZE_OPTIONS);
    clearSessionOutputs();
    setSelectedServiceId('')
    setSelectedServiceType('')
    setSelectedSku('')
    setUseCustomServicio(false)
    setCustomServicioText('')
  };

  // ─── Computed ─────────────────────────────────────────────────
  const grouped = groupByItemType(services)
  const isReady = !!activeBrandId && !!activeServicio.trim()
  const selectedProduct = productCatalog.find(p => p.sku === selectedSku) ?? null

  // Group products by linea for the SKU selector
  const productsByLinea = productCatalog.reduce((acc, p) => {
    const key = p.linea ?? 'Otros'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {} as Record<string, ProductBlueprint[]>)

  return (
    <div className="max-w-3xl space-y-8">

      {/* HELP BANNER */}
      <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-accent">Empieza aquí</p>
          <p className="text-xs text-uv-text-muted leading-relaxed">
            Configura la marca, el producto/servicio y las opciones de generación.
            Todo lo que elijas aquí aplica automáticamente en <strong className="text-uv-text">CopyPack</strong> y <strong className="text-uv-text">Tools</strong> — no hace falta configurar nada más allá.
          </p>
          {!isReady && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              Selecciona una marca y elige el producto/servicio para comenzar.
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

          {/* Marca */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Marca</label>
            {brandsLoading ? (
              <div className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-uv-text-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
              </div>
            ) : (
              <select value={activeBrandId} onChange={(e) => setActiveBrandId(e.target.value)}
                className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
          </div>

          {/* Idioma — dinámico desde brand_languages */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Idioma</label>
            <select
              value={activeLanguage}
              onChange={(e) => setActiveLanguage(e.target.value as any)}
              className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {languages.length > 0 ? (
                languages.map(l => (
                  <option key={l.id} value={l.idioma_id}>
                    {l.descripcion ?? l.idioma_id}
                    {l.is_primary ? ' ★' : ''}
                  </option>
                ))
              ) : (
                // Fallback hardcoded si brand_languages está vacío
                <>
                  <option value="ES">Español (ES)</option>
                  <option value="es-FL">Español (Florida)</option>
                  <option value="SPANG">Spanglish</option>
                  <option value="EN">English</option>
                </>
              )}
            </select>
          </div>

          {/* Pack */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Pack</label>
            <select value={activePackId} onChange={(e) => setActivePackId(e.target.value)}
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
        <div className="space-y-3">

          {/* Selector dinámico de servicio */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">
              Selecciona producto o servicio
            </label>
            {servicesLoading ? (
              <div className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-uv-text-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> Cargando servicios...
              </div>
            ) : services.length > 0 ? (
              <select
                value={useCustomServicio ? '__custom__' : selectedServiceId}
                onChange={(e) => handleServiceChange(e.target.value)}
                className={cn(
                  "w-full bg-uv-card border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors",
                  !selectedServiceId && !useCustomServicio ? "border-amber-500/40" : "border-uv-border"
                )}
              >
                <option value="">— Elige producto/servicio —</option>
                {Object.entries(grouped).map(([type, items]) => (
                  <optgroup key={type} label={ITEM_TYPE_LABELS[type] ?? type}>
                    {items.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.servicio ?? s.producto ?? s.id}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="✏️ Personalizado">
                  <option value="__custom__">Otro (texto libre)...</option>
                </optgroup>
              </select>
            ) : (
              // Fallback: text input si no hay brand_services
              <input
                type="text"
                value={activeServicio}
                onChange={(e) => setActiveServicio(e.target.value)}
                placeholder="e.g. Shampoo reparador D7 · Detailing completo · Administración de condominios"
                className={cn(
                  "w-full bg-uv-card border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors",
                  !activeServicio.trim() ? "border-amber-500/40" : "border-uv-border"
                )}
              />
            )}

            {/* Texto libre cuando se selecciona "Otro" */}
            {useCustomServicio && (
              <input
                type="text"
                value={customServicioText}
                onChange={(e) => setCustomServicioText(e.target.value)}
                placeholder="Escribe el producto/servicio..."
                autoFocus
                className={cn(
                  "w-full bg-uv-card border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors",
                  !customServicioText.trim() ? "border-amber-500/40" : "border-uv-border"
                )}
              />
            )}
          </div>

          {/* Selector de SKU — condicional cuando item_type = producto | ambos */}
          {isProductType(selectedServiceType) && (
            <div className="space-y-2">
              <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-3 h-3" /> SKU específico
                <span className="text-uv-text-muted normal-case font-normal">(opcional)</span>
              </label>
              {productsLoading ? (
                <div className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-uv-text-muted">
                  <Loader2 className="w-3 h-3 animate-spin" /> Cargando catálogo...
                </div>
              ) : productCatalog.length > 0 ? (
                <select
                  value={selectedSku}
                  onChange={(e) => handleSkuChange(e.target.value)}
                  className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">— Sin SKU específico (copy general) —</option>
                  {Object.entries(productsByLinea).map(([linea, products]) => (
                    <optgroup key={linea} label={`📦 ${linea}`}>
                      {products.map(p => (
                        <option key={p.id} value={p.sku ?? p.id}>
                          {p.name}
                          {p.size ? ` · ${p.size}` : ''}
                          {p.b2b_only ? ' · PRO' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : null}

              {/* Preview del producto seleccionado */}
              {selectedProduct && (
                <div className="bg-uv-card border border-accent/20 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-bold text-accent">{selectedProduct.name}</p>
                  {selectedProduct.description_es && (
                    <p className="text-xs text-uv-text-muted line-clamp-2">
                      {selectedProduct.description_es}
                    </p>
                  )}
                  {selectedProduct.benefit_claims?.length ? (
                    <p className="text-xs text-uv-text-muted">
                      Claims: {selectedProduct.benefit_claims.slice(0, 3).join(' · ')}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Contexto adicional */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">
              Contexto adicional <span className="text-uv-text-muted normal-case">(opcional)</span>
            </label>
            <textarea
              value={activeExtraContext}
              onChange={(e) => setActiveExtraContext(e.target.value)}
              placeholder="Detalles adicionales sobre la campaña, el momento, la oferta, el público objetivo específico..."
              className="w-full h-24 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
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
              onChange={(e) => setActiveKeywords(e.target.value)}
              placeholder="keyword1, keyword2, keyword3"
              className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

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
            <select value={activeTone} onChange={(e) => setActiveTone(e.target.value as CopyTone)}
              className="w-full bg-uv-card border border-uv-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent">
              {TONE_PRESETS.map(t => <option key={t.id} value={t.id}>{t.label} — {t.description}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider">Formato de output</label>
            <div className="grid grid-cols-4 gap-2">
              {(['markdown', 'plain', 'json', 'html'] as CopyOutputFormat[]).map((f) => (
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
            { key: 'include_emojis',   label: 'Incluir Emojis',   desc: 'Añade emojis para mejorar el engagement visual.' },
            { key: 'include_cta',      label: 'Incluir CTA',      desc: 'Añade llamada a la acción al final.' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div><p className="text-sm font-bold">{label}</p><p className="text-xs text-uv-text-muted">{desc}</p></div>
              <Toggle
                active={customizeOptions[key as keyof typeof customizeOptions] as boolean}
                onToggle={(v) => setCustomizeOptions({ [key]: v })}
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
              {(['strict', 'standard'] as const).map((m) => (
                <button key={m} onClick={() => setCustomizeOptions({ compliance_mode: m })}
                  className={cn("px-3 py-3 rounded-xl border text-left transition-all",
                    customizeOptions.compliance_mode === m ? "bg-accent/10 border-accent" : "bg-uv-card border-uv-border hover:border-accent/50")}>
                  <p className={cn("text-xs font-bold uppercase", customizeOptions.compliance_mode === m ? "text-accent" : "text-uv-text")}>{m}</p>
                  <p className="text-[10px] text-uv-text-muted mt-0.5">
                    {m === 'strict' ? "Bloquea si hay warnings." : "Advierte pero genera."}
                  </p>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-xs font-mono text-uv-text-muted uppercase tracking-wider flex items-center gap-2">
              <Palette className="w-3 h-3" /> Variant Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'balanced', 'creative'] as const).map((s) => (
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
          onChange={(e) => setCustomizeOptions({ extra_notes: e.target.value })}
          placeholder="Instrucciones adicionales que aplican a todas las generaciones de esta sesión..."
          className="w-full h-28 bg-uv-card border border-uv-border rounded-xl p-4 text-sm outline-none focus:border-accent resize-none"
        />
      </section>

      {/* RESET */}
      <div className="flex items-center justify-between pt-2 border-t border-uv-border">
        <p className="text-xs text-uv-text-muted">La configuración persiste durante la sesión del browser.</p>
        <Button variant="ghost" onClick={handleReset} className="text-xs text-uv-text-muted">
          Limpiar sesión
        </Button>
      </div>

    </div>
  );
};

const Toggle = ({ active, onToggle }: { active: boolean; onToggle: (v: boolean) => void }) => (
  <button onClick={() => onToggle(!active)}
    className={cn("w-10 h-5 rounded-full relative transition-colors shrink-0", active ? "bg-accent" : "bg-uv-border")}>
    <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", active ? "right-1" : "left-1")} />
  </button>
);
