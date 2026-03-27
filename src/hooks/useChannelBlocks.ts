/**
 * UNRLVL CopyLab — hooks/useChannelBlocks.ts
 * Carga canal_blocks desde Supabase.
 * Reemplaza CHANNEL_BLOCKS hardcodeado en src/config/channelBlocks.ts
 */

import { useState, useEffect } from 'react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export interface ChannelBlock {
  id: string
  name: string
  platform: string
  char_limit: number | null
  tone_modifier: string | null
  restrictions: Record<string, unknown> | null
  block_text: string | null
  active: boolean
}

export function useChannelBlocks() {
  const [blocks, setBlocks] = useState<ChannelBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/canal_blocks?active=eq.true&select=id,name,platform,char_limit,tone_modifier,restrictions,block_text,active&order=name`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          }
        )
        if (!res.ok) throw new Error(`Supabase ${res.status}`)
        setBlocks(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando canales')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { blocks, loading, error }
}
