/**
 * CopyLab UI Components v1.0 — UNRLVL Studio
 * 
 * Integrar en el CopyLab React app:
 * 
 * 1. <DbStatusBadge />        — Badge de conexión a Supabase (header/topbar)
 * 2. <PipelineLayerTracker /> — Tracker visual de layers activos por content_type
 * 3. <BrandSelector />        — Dropdown dinámico de marcas desde Supabase
 * 4. <TemplateSelector />     — Dropdown dinámico de templates desde Supabase
 * 
 * Requiere en env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (cliente)
 *                  SUPABASE_URL + SUPABASE_ANON_KEY (serverless /api/)
 * 
 * Instalar si no están: 
 *   npm install @supabase/supabase-js
 */

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client (browser-side, usa VITE_ prefix)
// ─────────────────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
type DbStatus = 'connecting' | 'connected' | 'error'

interface PipelineLayer {
  id: string
  layer_order: number
  layer_name: string
  layer_code: string
  applies_to: string[]
  active: boolean
  version: string
}

interface Brand {
  id: string
  display_name: string
  status: string
  type: string
}

interface OutputTemplate {
  id: string
  name: string
  category: string
  applies_to: string[] | null
  active: boolean
  version: string
}

type LayerRunStatus = 'pending' | 'running' | 'done' | 'skipped'

interface LayerState {
  layer: PipelineLayer
  status: LayerRunStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DB STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────
export function DbStatusBadge() {
  const [status, setStatus] = useState<DbStatus>('connecting')
  const [latencyMs, setLatencyMs] = useState<number | null>(null)

  const ping = useCallback(async () => {
    setStatus('connecting')
    const t0 = performance.now()
    try {
      // Ping mínimo: SELECT 1 desde una tabla siempre activa
      const { error } = await supabase
        .from('brands')
        .select('id')
        .limit(1)
        .single()
      const ms = Math.round(performance.now() - t0)
      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows, pero la conexión funcionó
        setStatus('error')
        setLatencyMs(null)
      } else {
        setStatus('connected')
        setLatencyMs(ms)
      }
    } catch {
      setStatus('error')
      setLatencyMs(null)
    }
  }, [])

  useEffect(() => {
    ping()
    // re-ping cada 60s
    const interval = setInterval(ping, 60_000)
    return () => clearInterval(interval)
  }, [ping])

  const styles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 500,
    fontFamily: 'var(--font-mono, monospace)',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'opacity 0.2s',
    border: '1px solid',
    ...(status === 'connected' && {
      background: '#0d2b1e',
      borderColor: '#1D9E75',
      color: '#5DCAA5',
    }),
    ...(status === 'connecting' && {
      background: '#1a1a14',
      borderColor: '#888780',
      color: '#B4B2A9',
    }),
    ...(status === 'error' && {
      background: '#2b0e0e',
      borderColor: '#E24B4A',
      color: '#F09595',
    }),
  }

  const dotStyle: React.CSSProperties = {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
    ...(status === 'connected' && {
      background: '#1D9E75',
      boxShadow: '0 0 5px #1D9E75',
      animation: 'pulse-green 2s infinite',
    }),
    ...(status === 'connecting' && {
      background: '#888780',
    }),
    ...(status === 'error' && {
      background: '#E24B4A',
      boxShadow: '0 0 5px #E24B4A',
    }),
  }

  const label =
    status === 'connected'
      ? `DB ${latencyMs}ms`
      : status === 'connecting'
      ? 'DB …'
      : 'DB ERR'

  return (
    <>
      <style>{`
        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <span style={styles} onClick={ping} title="Haz clic para reconectar">
        <span style={dotStyle} />
        {label}
      </span>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PIPELINE LAYER TRACKER
// Props:
//   contentType: el content_type del output en progreso ('email_sequence', etc.)
//   activeLayerCode: el layer_code del layer que se está ejecutando ahora
//   completedLayers: array de layer_codes ya completados
//   onLayerClick: callback cuando el usuario hace clic en un layer para info
// ─────────────────────────────────────────────────────────────────────────────
interface PipelineLayerTrackerProps {
  contentType: string
  activeLayerCode?: string | null
  completedLayers?: string[]
  errorLayer?: string | null
  allComplete?: boolean  // true = todos los layers aplicables marcados como done (post-generación)
}

export function PipelineLayerTracker({
  contentType,
  activeLayerCode = null,
  completedLayers = [],
  errorLayer = null,
  allComplete = false,
}: PipelineLayerTrackerProps) {
  const [layers, setLayers] = useState<PipelineLayer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchLayers() {
      setLoading(true)
      const { data, error } = await supabase
        .from('pipeline_skills')
        .select('id, layer_order, layer_name, layer_code, applies_to, active, version')
        .contains('applies_to', [contentType])
        .eq('active', true)
        .order('layer_order', { ascending: true })

      if (!error && data) {
        setLayers(data)
      }
      setLoading(false)
    }
    if (contentType) fetchLayers()
  }, [contentType])

  // Determinar estado de cada layer
  const getLayerStatus = (layerCode: string): LayerRunStatus => {
    if (allComplete) return 'done'
    if (errorLayer === layerCode) return 'running'
    if (completedLayers.includes(layerCode)) return 'done'
    if (activeLayerCode === layerCode) return 'running'
    return 'pending'
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '12px',
    background: '#0e0e0c',
    borderRadius: '10px',
    border: '1px solid #2C2C2A',
    minWidth: '200px',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  }

  const titleStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#5F5E5A',
    fontFamily: 'var(--font-mono, monospace)',
  }

  const countStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#444441',
    fontFamily: 'var(--font-mono, monospace)',
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>Pipeline</span>
        </div>
        <span style={{ fontSize: '11px', color: '#444441' }}>Cargando layers…</span>
      </div>
    )
  }

  if (layers.length === 0) return null

  const done = completedLayers.length
  const total = layers.length

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Pipeline v2.6</span>
        <span style={countStyle}>{done}/{total}</span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: '2px',
        background: '#2C2C2A',
        borderRadius: '1px',
        marginBottom: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${(done / total) * 100}%`,
          background: '#1D9E75',
          borderRadius: '1px',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Layers list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {layers.map((layer) => {
          const status = getLayerStatus(layer.layer_code)
          const isCreativeEngine = layer.layer_order >= 140

          return (
            <LayerRow
              key={layer.id}
              layer={layer}
              status={status}
              isError={errorLayer === layer.layer_code}
              isCreativeEngine={isCreativeEngine}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: '1px solid #2C2C2A',
        flexWrap: 'wrap',
      }}>
        {[
          { status: 'done', label: 'Completado', color: '#1D9E75' },
          { status: 'running', label: 'Activo', color: '#EF9F27' },
          { status: 'pending', label: 'Pendiente', color: '#444441' },
          { status: 'skipped', label: 'No aplica', color: '#2C2C2A' },
        ].map(({ status, label, color }) => (
          <span key={status} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '9px', color: '#5F5E5A',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: color, flexShrink: 0,
            }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

interface LayerRowProps {
  layer: PipelineLayer
  status: LayerRunStatus
  isError: boolean
  isCreativeEngine: boolean
}

function LayerRow({ layer, status, isError, isCreativeEngine }: LayerRowProps) {
  const [hovered, setHovered] = useState(false)

  const statusColors: Record<LayerRunStatus, string> = {
    done: '#1D9E75',
    running: isError ? '#E24B4A' : '#EF9F27',
    pending: '#2C2C2A',
    skipped: '#1a1a14',
  }

  const dotColor = statusColors[status]

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 4px',
    borderRadius: '5px',
    cursor: 'default',
    transition: 'background 0.15s',
    background: hovered ? '#1a1a14' : 'transparent',
    position: 'relative',
  }

  const codeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '9px',
    color: '#444441',
    minWidth: '16px',
    textAlign: 'right',
  }

  const nameStyle: React.CSSProperties = {
    fontSize: '11px',
    color: status === 'done' ? '#5DCAA5'
      : status === 'running' ? (isError ? '#F09595' : '#FAC775')
      : status === 'pending' ? '#5F5E5A'
      : '#2C2C2A',
    flex: 1,
    fontWeight: status === 'running' ? 600 : 400,
    transition: 'color 0.2s',
  }

  // Número de layer
  const layerNum = isCreativeEngine
    ? `L${layer.layer_order / 10}`
    : `L${layer.layer_order === 15 ? '1.5' : layer.layer_order / 10}`

  return (
    <div
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Running pulse animation */}
      {status === 'running' && (
        <style>{`
          @keyframes layer-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
          }
        `}</style>
      )}

      {/* Dot */}
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: dotColor,
        flexShrink: 0,
        ...(status === 'running' && !isError && {
          animation: 'layer-pulse 0.8s ease-in-out infinite',
        }),
        ...(status === 'done' && {
          boxShadow: `0 0 4px ${dotColor}40`,
        }),
      }} />

      {/* Layer number */}
      <span style={codeStyle}>{layerNum}</span>

      {/* Separator dot */}
      <span style={{ color: '#2C2C2A', fontSize: '10px', flexShrink: 0 }}>·</span>

      {/* Layer name */}
      <span style={nameStyle}>{layer.layer_name}</span>

      {/* Creative engine tag */}
      {isCreativeEngine && (
        <span style={{
          fontSize: '8px',
          padding: '1px 5px',
          background: '#1a1219',
          color: '#534AB7',
          borderRadius: '3px',
          border: '1px solid #26215C',
          flexShrink: 0,
        }}>CE</span>
      )}

      {/* Done check */}
      {status === 'done' && (
        <span style={{ color: '#1D9E75', fontSize: '9px', flexShrink: 0 }}>✓</span>
      )}
      {isError && (
        <span style={{ color: '#E24B4A', fontSize: '9px', flexShrink: 0 }}>✗</span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BRAND SELECTOR — dinámico desde Supabase
// ─────────────────────────────────────────────────────────────────────────────
interface BrandSelectorProps {
  value: string
  onChange: (brandId: string) => void
  disabled?: boolean
}

export function BrandSelector({ value, onChange, disabled = false }: BrandSelectorProps) {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBrands() {
      const { data, error } = await supabase
        .from('brands')
        .select('id, display_name, status, type')
        .eq('status', 'active')
        .neq('type', 'system')
        .order('display_name')

      if (!error && data) setBrands(data)
      setLoading(false)
    }
    fetchBrands()
  }, [])

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      style={selectStyle}
    >
      <option value="">{loading ? 'Cargando marcas…' : '— Selecciona marca —'}</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>{b.display_name}</option>
      ))}
    </select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TEMPLATE SELECTOR — dinámico desde Supabase, filtrado por content_type
// ─────────────────────────────────────────────────────────────────────────────
interface TemplateSelectorProps {
  value: string
  onChange: (templateId: string) => void
  filterContentType?: string  // si se pasa, filtra templates por applies_to
  disabled?: boolean
}

export function TemplateSelector({
  value,
  onChange,
  filterContentType,
  disabled = false,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<OutputTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTemplates() {
      setLoading(true)
      let query = supabase
        .from('output_templates')
        .select('id, name, category, applies_to, active, version')
        .eq('active', true)
        .order('name')

      if (filterContentType) {
        query = query.contains('applies_to', [filterContentType])
      }

      const { data, error } = await query
      if (!error && data) setTemplates(data)
      setLoading(false)
    }
    fetchTemplates()
  }, [filterContentType])

  // Agrupar por categoría para optgroup
  const grouped = templates.reduce<Record<string, OutputTemplate[]>>((acc, t) => {
    const cat = t.category || 'otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(t)
    return acc
  }, {})

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      style={selectStyle}
    >
      <option value="">{loading ? 'Cargando templates…' : '— Selecciona template —'}</option>
      {Object.entries(grouped).map(([category, items]) => (
        <optgroup key={category} label={category.toUpperCase()}>
          {items.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.version !== '1.0' ? `v${t.version}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTILOS COMPARTIDOS
// ─────────────────────────────────────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  background: '#0e0e0c',
  border: '1px solid #2C2C2A',
  borderRadius: '6px',
  color: '#c2c0b6',
  padding: '6px 10px',
  fontSize: '13px',
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.15s',
}

// ─────────────────────────────────────────────────────────────────────────────
// EJEMPLO DE USO — cómo integrar todo junto
// ─────────────────────────────────────────────────────────────────────────────
/*
import { DbStatusBadge, PipelineLayerTracker, BrandSelector, TemplateSelector } from './CopyLabComponents'

// En el header de CopyLab:
<DbStatusBadge />

// En el panel lateral:
<BrandSelector
  value={selectedBrandId}
  onChange={setBrandId}
/>

<TemplateSelector
  value={selectedTemplateId}
  onChange={setTemplateId}
  filterContentType={selectedContentType}  // opcional: filtra por content_type
/>

// Debajo del output, durante generación:
<PipelineLayerTracker
  contentType="email_sequence"       // content_type del job activo
  activeLayerCode={currentLayer}     // layer que está corriendo ahora
  completedLayers={doneLayers}       // array de layer_codes terminados
  errorLayer={failedLayer}           // si hubo error, qué layer
/>

// Para actualizar el tracker durante la generación, en api/execute.ts
// después de cada step del pipeline, emitir via SSE o WebSocket:
// { type: 'layer_update', layerCode: 'WRITE', status: 'done' }
// { type: 'layer_update', layerCode: 'VOICE_GENOME_INJECTION', status: 'running' }
*/
