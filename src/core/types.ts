/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- GENERIC TYPES (from ImageLab) ---

export type TabId = "copypack" | "tools" | "customize";

export type LibraryAssetKind = "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO";

export type PersonType = "REAL" | "AI" | "FICTIONAL";

export type CreativityLevel = "LOW" | "MEDIUM" | "HIGH" | "MAX";

export type VarietyStrength = "LOW" | "MEDIUM" | "HIGH";

export interface DebugMetadata {
  timestamp: number;
  duration: number;
  model: string;
  [key: string]: any;
}

export interface LibraryAsset {
  id: string;
  url: string;
  kind: LibraryAssetKind;
  name: string;
  size?: number;
  createdAt: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export type PreflightStatus = "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";

export interface PromptPackValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export const VARIANT_OPTIONS = [1, 2, 3, 4, 5] as const;

// --- COPYLAB SPECIALTY TYPES ---

export type CopyChannel = 
  | "META_ADS" 
  | "TIKTOK_ADS" 
  | "GOOGLE_SEARCH" 
  | "GOOGLE_PMAX" 
  | "INSTAGRAM_ORGANICO" 
  | "TIKTOK_ORGANICO" 
  | "YOUTUBE" 
  | "WEB" 
  | "LANDING_PAGE" 
  | "BLOG" 
  | "EMAIL";

export type CopyPackType =
  | "social_post" 
  | "ad_copy" 
  | "email_subject" 
  | "blog_outline" 
  | "script_brief" 
  | "seo_meta" 
  | "cta_variants"
  | "video_podcast"
  | "email_sequence"
  | "product_description";

export type CopyOutputFormat = "markdown" | "plain" | "json" | "html";

export type CopyTone = 
  | "authoritative" 
  | "warm" 
  | "conversational" 
  | "energetic" 
  | "calm" 
  | "technical";

export type CopyLanguage = "ES" | "es-FL" | "SPANG" | "EN";

// Declarative per-job metadata. Only the email_sequence and product_description
// packs declare it; the classic packs omit it entirely. `language` and `motor`
// are the only fields every existing meta sets — the rest are sequence-specific.
export interface CopyJobMeta {
  language: CopyLanguage;
  motor: string;                    // generation engine, e.g. "claude"
  sequence_type?: string;           // e.g. "abandoned_cart", "welcome"
  position?: number;                // 1-based position within the sequence
  psycho_presets?: string[];
  mechanism_primary?: string;
  depends_on?: string[];            // ids of earlier jobs in the same sequence
  klaviyo_template_slot?: string;
}

export interface CopyJob {
  id: string;
  label: string;
  prompt_type: string;       // e.g. "prompt_Ads_FullPro"
  channel: CopyChannel;
  outputs: number;           // number of variants to generate
  meta?: CopyJobMeta;
}

export interface CopyPackSpec {
  id: string;
  label: string;
  packType: CopyPackType;
  jobs: CopyJob[];
}

export interface BrandProfile {
  id: string;
  name: string;
  color: string;
  description?: string;
  tone_of_voice?: string;
  target_audience?: string;
}

export interface CopyOutput {
  id: string;
  label: string;
  content: string;           // generated text
  channel: CopyChannel;
  prompt_type: string;
  language: CopyLanguage;
  brand_id: string;
  createdAt: number;
  metadata?: any;
}

export interface CopyPackRequest {
  schema_version: number;
  brand_id: string;
  pack_type: CopyPackType;
  channel: CopyChannel;
  language: CopyLanguage;
  brand_context: string;
  compliance_rules: string;
  keywords: string[];
  geo: string;
  tone: CopyTone;
  cta_base: string;
  jobs: CopyJob[];
  output_format: CopyOutputFormat;
}
