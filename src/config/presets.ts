import { CopyTone, CopyOutputFormat } from "../core/types";

export const TONE_PRESETS: { id: CopyTone; label: string; description: string }[] = [
  { id: "warm", label: "Warm", description: "Friendly, approachable, and empathetic." },
  { id: "authoritative", label: "Authoritative", description: "Expert, confident, and commanding." },
  { id: "conversational", label: "Conversational", description: "Natural, easy-going, like a friend talking." },
  { id: "energetic", label: "Energetic", description: "High-energy, exciting, and motivational." },
  { id: "calm", label: "Calm", description: "Peaceful, reassuring, and steady." },
  { id: "technical", label: "Technical", description: "Precise, detailed, and factual." }
];

export const LENGTH_PRESETS = [
  { id: "short", label: "Short", range: "50-80 words", description: "Punchy and direct." },
  { id: "medium", label: "Medium", range: "150-300 words", description: "Balanced and informative." },
  { id: "long", label: "Long", range: "500+ words", description: "In-depth and comprehensive." }
];

export const FORMAT_PRESETS: { id: CopyOutputFormat; label: string }[] = [
  { id: "markdown", label: "Markdown" },
  { id: "plain", label: "Plain Text" },
  { id: "json", label: "JSON" },
  { id: "html", label: "HTML" }
];
