/**
 * UNRLVL CopyLab — config/presets.ts
 * TONE_PRESETS y FORMAT_PRESETS — config UI estática.
 * NO son datos de marca — son opciones de interfaz,
 * por eso quedan aquí y no en Supabase.
 */

export interface TonePreset {
  id: string
  label: string
  description: string
}

export interface FormatPreset {
  id: string
  label: string
}

export const TONE_PRESETS: TonePreset[] = [
  { id: 'warm',           label: 'Warm',          description: 'Friendly, approachable, and empathetic.' },
  { id: 'authoritative',  label: 'Authoritative',  description: 'Expert, confident, and commanding.' },
  { id: 'conversational', label: 'Conversational', description: 'Natural, easy-going, like a friend talking.' },
  { id: 'energetic',      label: 'Energetic',      description: 'High-energy, exciting, and motivational.' },
  { id: 'calm',           label: 'Calm',           description: 'Peaceful, reassuring, and steady.' },
  { id: 'technical',      label: 'Technical',      description: 'Precise, detailed, and factual.' },
]

export const FORMAT_PRESETS: FormatPreset[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'plain',    label: 'Plain Text' },
  { id: 'json',     label: 'JSON' },
  { id: 'html',     label: 'HTML' },
]
