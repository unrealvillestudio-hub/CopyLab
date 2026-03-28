/**
 * UNRLVL CopyLab — state/sessionStore.ts
 * Store global de sesión compartido entre todos los módulos.
 * Customize es el punto de entrada — configura el contexto.
 * CopyPack genera. Tools refina.
 * Updated: 2026-03-28d
 *   · NEW: activeStep1, activeSelectedSku, activeCustomText
 *     Movidos desde useState local de CopyCustomizeModule al store
 *     para sobrevivir la navegación entre pestañas.
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CopyOutput, CopyLanguage, CopyTone, CopyOutputFormat } from '../core/types'

export interface CustomizeOptions {
  compliance_mode: 'strict' | 'standard'
  variant_style: 'conservative' | 'balanced' | 'creative'
  include_hashtags: boolean
  include_emojis: boolean
  include_cta: boolean
  extra_notes: string
}

export const DEFAULT_CUSTOMIZE_OPTIONS: CustomizeOptions = {
  compliance_mode: 'standard',
  variant_style: 'balanced',
  include_hashtags: true,
  include_emojis: true,
  include_cta: true,
  extra_notes: '',
}

// Temperatura según variant_style (capeada a 1.0)
export const VARIANT_TEMPERATURE: Record<string, number> = {
  conservative: 0.5,
  balanced:     0.8,
  creative:     1.0,
}

export interface SessionState {
  // ── Contexto de campaña — configurado en Customize ──
  activeBrandId:      string
  setActiveBrandId:   (id: string) => void
  activeLanguage:     CopyLanguage
  setActiveLanguage:  (lang: CopyLanguage) => void
  activePackId:       string
  setActivePackId:    (id: string) => void
  activeServicio:     string
  setActiveServicio:  (s: string) => void
  activeKeywords:     string
  setActiveKeywords:  (kw: string) => void
  activeTone:         CopyTone
  setActiveTone:      (tone: CopyTone) => void
  activeOutputFormat: CopyOutputFormat
  setActiveOutputFormat: (format: CopyOutputFormat) => void
  activeExtraContext: string
  setActiveExtraContext: (ctx: string) => void

  // ── Selector de producto — persistido para sobrevivir navegación ──
  // Antes eran useState local en CopyCustomizeModule (se perdían al navegar)
  activeStep1:       string   // 'line:Moisture' | 'svc:uuid' | '__custom__' | ''
  setActiveStep1:    (v: string) => void
  activeSelectedSku: string   // SKU del producto específico seleccionado
  setActiveSelectedSku: (v: string) => void
  activeCustomText:  string   // texto libre cuando step1 === '__custom__'
  setActiveCustomText: (v: string) => void

  // ── Opciones avanzadas de Customize ──
  customizeOptions:   CustomizeOptions
  setCustomizeOptions: (opts: Partial<CustomizeOptions>) => void

  // ── Outputs generados en esta sesión ──
  sessionOutputs:     CopyOutput[]
  addSessionOutputs:  (outputs: CopyOutput[]) => void
  clearSessionOutputs: () => void

  // ── Estado de generación ──
  isGenerating:       boolean
  setIsGenerating:    (v: boolean) => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeBrandId:    '',
      setActiveBrandId: (id) => set({ activeBrandId: id }),

      activeLanguage:    'ES',
      setActiveLanguage: (lang) => set({ activeLanguage: lang }),

      activePackId:    '',
      setActivePackId: (id) => set({ activePackId: id }),

      activeServicio:    '',
      setActiveServicio: (s) => set({ activeServicio: s }),

      activeKeywords:    '',
      setActiveKeywords: (kw) => set({ activeKeywords: kw }),

      activeTone:    'conversational',
      setActiveTone: (tone) => set({ activeTone: tone }),

      activeOutputFormat:    'markdown',
      setActiveOutputFormat: (format) => set({ activeOutputFormat: format }),

      activeExtraContext:    '',
      setActiveExtraContext: (ctx) => set({ activeExtraContext: ctx }),

      // Selector de producto — persistido
      activeStep1:       '',
      setActiveStep1:    (v) => set({ activeStep1: v }),
      activeSelectedSku: '',
      setActiveSelectedSku: (v) => set({ activeSelectedSku: v }),
      activeCustomText:  '',
      setActiveCustomText: (v) => set({ activeCustomText: v }),

      customizeOptions: DEFAULT_CUSTOMIZE_OPTIONS,
      setCustomizeOptions: (opts) =>
        set((state) => ({ customizeOptions: { ...state.customizeOptions, ...opts } })),

      sessionOutputs:      [],
      addSessionOutputs:   (outputs) =>
        set((state) => ({ sessionOutputs: [...outputs, ...state.sessionOutputs] })),
      clearSessionOutputs: () => set({ sessionOutputs: [] }),

      isGenerating:    false,
      setIsGenerating: (v) => set({ isGenerating: v }),
    }),
    {
      name:    'copylab-session',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)
