/**
 * UNRLVL CopyLab — hooks/useBrands.ts
 * Carga la lista de marcas desde Supabase.
 * Fix 2026-05-20:
 *   - Excluir marca DEFAULT (id=neq.DEFAULT) — no es una marca operacional
 *   - Corregir campo: agent_tone → tono_base
 *   - Excluir marcas de tipo sistema que no generan copy (type=neq.system si aplica)
 */

import { useState, useEffect } from 'react'
import type { BrandProfile } from '../core/types'

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     as string
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
  const [brands, setBrands]   = useState<BrandOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          // Excluir DEFAULT — es el perfil global de humanize, no una marca operacional
          `${SUPABASE_URL}/rest/v1/brands?status=eq.active&id=neq.DEFAULT&select=id,display_name,tono_base,market,language_primary&order=display_name`,
          {
            headers: {
              apikey:        SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        )
        if (!res.ok) throw new Error(`Supabase ${res.status}`)
        const data = await res.json()
        setBrands(
          data.map((b: any) => ({
            id:               b.id,
            name:             b.display_name,
            color:            '#00ff88',
            tone_of_voice:    b.tono_base ?? '',   // fix: era agent_tone (campo inexistente)
            market:           b.market ?? '',
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

  function toBrandProfile(brandId: string): BrandProfile | null {
    const b = brands.find(x => x.id === brandId)
    if (!b) return null
    return {
      id:            b.id,
      name:          b.name,
      color:         b.color,
      description:   b.market,
      tone_of_voice: b.tone_of_voice,
    }
  }

  return { brands, loading, error, toBrandProfile }
}
