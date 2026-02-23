import { 
  BrandProfile, 
  CopyPackSpec, 
  CopyLanguage, 
  CopyTone, 
  CopyOutputFormat, 
  CopyOutput 
} from "../core/types";
import { buildCopyPrompt, generateCopy, validateCompliance } from "./copyEngine";
import { CHANNEL_BLOCKS } from "../config/channelBlocks";

export async function runCopyPack(params: {
  brand: BrandProfile,
  pack: CopyPackSpec,
  language: CopyLanguage,
  keywords: string[],
  productContext: string,
  tone: CopyTone,
  ctaBase: string,
  outputFormat: CopyOutputFormat,
  signal?: AbortSignal
}): Promise<CopyOutput[]> {
  const results: CopyOutput[] = [];

  for (const job of params.pack.jobs) {
    const channelBlock = CHANNEL_BLOCKS[job.channel];
    const prompt = buildCopyPrompt({
      brand: params.brand,
      pack: params.pack,
      job: job,
      language: params.language,
      keywords: params.keywords,
      productContext: params.productContext,
      channelBlock: channelBlock ? `${channelBlock.label}: ${channelBlock.restrictions.join(". ")}` : "",
      complianceRules: "Standard advertising compliance. Avoid medical claims.",
      geo: "Global",
      tone: params.tone,
      ctaBase: params.ctaBase,
    });

    const content = await generateCopy({
      prompt,
      outputFormat: params.outputFormat,
      signal: params.signal
    });

    const compliance = validateCompliance(content, "");

    results.push({
      id: crypto.randomUUID(),
      label: job.label,
      content: content,
      channel: job.channel,
      prompt_type: job.prompt_type,
      language: params.language,
      brand_id: params.brand.id,
      createdAt: Date.now(),
      metadata: {
        compliance_passed: compliance.passed,
        compliance_warnings: compliance.warnings,
        job_id: job.id
      }
    });
  }

  return results;
}
