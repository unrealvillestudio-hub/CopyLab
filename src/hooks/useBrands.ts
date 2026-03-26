/**
 * UNRLVL CopyLab — hooks/useBrands.ts
 * Carga la lista de marcas desde Supabase en lugar de
 * BRANDS hardcodeado en src/config/brands.ts
 * Fase 5b · 2026-03-26
 */

import { useState, useEffect } from 'react'
import type { BrandProfile } from '../core/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface BrandOption {
  id: string
  name: string
  color: string
  description?: string
  tone_of_voice?: string
  market?: string
  language_primary?: string
}

export function useBrands() {
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/brands?status=eq.active&select=id,display_name,agent_tone,market,language_primary&order=display_name`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        )
        if (!res.ok) throw new Error(`Supabase ${res.status}`)
        const data = await res.json()
        setBrands(
          data.map((b: any) => ({
            id: b.id,
            name: b.display_name,
            color: '#00ff88',                // accent por defecto
            tone_of_voice: b.agent_tone ?? '',
            market: b.market ?? '',
            language_primary: b.language_primary ?? 'es-ES',
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando marcas')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Convierte a BrandProfile para compatibilidad con runCopyPack
  function toBrandProfile(brandId: string): BrandProfile | null {
    const b = brands.find(x => x.id === brandId)
    if (!b) return null
    return {
      id: b.id,
      name: b.name,
      color: b.color,
      description: b.market,
      tone_of_voice: b.tone_of_voice,
    }
  }

  return { brands, loading, error, toBrandProfile }
}
