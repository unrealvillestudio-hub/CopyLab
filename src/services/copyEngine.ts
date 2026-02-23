import { GoogleGenAI } from "@google/genai";
import { 
  BrandProfile, 
  CopyPackSpec, 
  CopyJob, 
  CopyLanguage, 
  CopyTone, 
  CopyOutputFormat 
} from "../core/types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    if ((status === 429 || status === 503) && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export function buildCopyPrompt(params: {
  brand: BrandProfile,
  pack: CopyPackSpec,
  job: CopyJob,
  language: CopyLanguage,
  keywords: string[],
  productContext: string,
  channelBlock: string,
  complianceRules: string,
  geo: string,
  tone: CopyTone,
  ctaBase: string,
  extraNotes?: string
}): string {
  const sections = [
    `ROLE: You are an expert copywriter for ${params.brand.name}.`,
    `LANGUAGE: ${params.language}`,
    `GEOGRAPHY: ${params.geo}`,
    `TONE: ${params.tone}`,
    `BRAND CONTEXT: ${params.productContext}`,
    `KEYWORDS: ${params.keywords.join(", ")}`,
    `CHANNEL INSTRUCTIONS: ${params.channelBlock}`,
    `COMPLIANCE RULES: ${params.complianceRules}`,
    `CTA BASE: ${params.ctaBase}`,
    `TASK: Generate ${params.job.outputs} variants for the following job: ${params.job.label} (${params.job.prompt_type}).`,
    `OUTPUT FORMAT: Please provide the output in ${params.job.channel} style.`
  ];

  if (params.extraNotes) {
    sections.push(`EXTRA NOTES: ${params.extraNotes}`);
  }

  return sections.join("\n\n");
}

export async function generateCopy(params: {
  prompt: string,
  outputFormat: CopyOutputFormat,
  signal?: AbortSignal
}): Promise<string> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: params.prompt }] }],
      config: {
        temperature: 0.8,
        maxOutputTokens: 2048,
      }
    });

    return response.text || "";
  });
}

export function validateCompliance(text: string, complianceRules: string): {
  passed: boolean,
  warnings: string[]
} {
  const prohibitedWords = ["cura", "elimina", "garantizado", "100%", "médico", "trata"];
  const warnings: string[] = [];

  const lowerText = text.toLowerCase();
  prohibitedWords.forEach(word => {
    if (lowerText.includes(word.toLowerCase())) {
      warnings.push(`Prohibited word found: "${word}"`);
    }
  });

  // Also check if any specific rules from complianceRules are violated (simple check)
  // In a real app, this would be more sophisticated.

  return {
    passed: warnings.length === 0,
    warnings
  };
}
