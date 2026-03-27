/**
 * UNRLVL CopyLab — state/sessionStore.ts
 * Store global de sesión compartido entre CopyPackModule,
 * CopyToolsModule y CopyCustomizeModule.
 * Persiste durante la sesión del browser (sessionStorage).
 * NO persiste entre recargas de página — intencional.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CopyOutput, CopyLanguage, CopyTone, CopyOutputFormat } from '../core/types'

// ─── Tipos ───────────────────────────────────────────────────

export interface SessionState {
  // Marca activa — compartida entre todos los módulos
  activeBrandId: string
  setActiveBrandId: (id: string) => void

  // Configuración activa — se mantiene al cambiar de tab
  activeLanguage: CopyLanguage
  setActiveLanguage: (lang: CopyLanguage) => void

  activeTone: CopyTone
  setActiveTone: (tone: CopyTone) => void

  activeOutputFormat: CopyOutputFormat
  setActiveOutputFormat: (format: CopyOutputFormat) => void

  // Outputs generados en esta sesión
  sessionOutputs: CopyOutput[]
  addSessionOutput: (output: CopyOutput) => void
  addSessionOutputs: (outputs: CopyOutput[]) => void
  clearSessionOutputs: () => void
  removeSessionOutput: (id: string) => void

  // Último pack generado — para retomar en Tools
  lastPackId: string
  setLastPackId: (id: string) => void

  lastProductContext: string
  setLastProductContext: (ctx: string) => void

  lastKeywords: string
  setLastKeywords: (kw: string) => void

  // Estado de generación cross-módulo
  isGenerating: boolean
  setIsGenerating: (v: boolean) => void
}

// ─── Store ───────────────────────────────────────────────────

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      // Marca activa
      activeBrandId: '',
      setActiveBrandId: (id) => set({ activeBrandId: id }),

      // Config
      activeLanguage: 'ES',
      setActiveLanguage: (lang) => set({ activeLanguage: lang }),

      activeTone: 'conversational',
      setActiveTone: (tone) => set({ activeTone: tone }),

      activeOutputFormat: 'markdown',
      setActiveOutputFormat: (format) => set({ activeOutputFormat: format }),

      // Outputs
      sessionOutputs: [],
      addSessionOutput: (output) =>
        set((state) => ({ sessionOutputs: [output, ...state.sessionOutputs] })),
      addSessionOutputs: (outputs) =>
        set((state) => ({ sessionOutputs: [...outputs, ...state.sessionOutputs] })),
      clearSessionOutputs: () => set({ sessionOutputs: [] }),
      removeSessionOutput: (id) =>
        set((state) => ({ sessionOutputs: state.sessionOutputs.filter((o) => o.id !== id) })),

      // Último contexto
      lastPackId: '',
      setLastPackId: (id) => set({ lastPackId: id }),

      lastProductContext: '',
      setLastProductContext: (ctx) => set({ lastProductContext: ctx }),

      lastKeywords: '',
      setLastKeywords: (kw) => set({ lastKeywords: kw }),

      // Generación
      isGenerating: false,
      setIsGenerating: (v) => set({ isGenerating: v }),
    }),
    {
      name: 'copylab-session',
      storage: createJSONStorage(() => sessionStorage), // se borra al cerrar el tab
    }
  )
)
