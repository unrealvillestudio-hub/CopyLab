export interface CopyTemplate {
  id: string;
  label: string;
  structure: string[];
  requiredInputs: string[];
  expectedOutput: string;
}

export const COPY_TEMPLATES: Record<string, CopyTemplate> = {
  prompt_SMPC_full: {
    id: "prompt_SMPC_full",
    label: "Social Media Post Creator",
    structure: ["Hook", "Body", "CTA", "Hashtags"],
    requiredInputs: ["topic", "audience", "tone"],
    expectedOutput: "A complete social media post with emojis and hashtags."
  },
  prompt_Ads_FullPro: {
    id: "prompt_Ads_FullPro",
    label: "Professional Ad Copy",
    structure: ["Headline", "Primary Text", "Description", "CTA"],
    requiredInputs: ["product", "benefit", "offer"],
    expectedOutput: "High-converting ad copy variants for Meta or TikTok."
  },
  prompt_SEO_FullPro: {
    id: "prompt_SEO_FullPro",
    label: "SEO Content Suite",
    structure: ["Title Tag", "Meta Description", "H1", "Content Outline"],
    requiredInputs: ["keyword", "target_url", "intent"],
    expectedOutput: "SEO-optimized meta tags and content structure."
  },
  prompt_SEO_Brand_FullPro: {
    id: "prompt_SEO_Brand_FullPro",
    label: "Branded SEO Suite",
    structure: ["Brand Title", "Brand Meta", "Branded Slug"],
    requiredInputs: ["brand_name", "core_value", "keyword"],
    expectedOutput: "SEO assets aligned with brand identity."
  },
  prompt_YouTube_Ideas: {
    id: "prompt_YouTube_Ideas",
    label: "YouTube Video Ideation",
    structure: ["Concept", "Target Audience", "Viral Potential"],
    requiredInputs: ["niche", "current_trends"],
    expectedOutput: "5 unique video concepts with high engagement potential."
  },
  prompt_YouTube_Titles: {
    id: "prompt_YouTube_Titles",
    label: "YouTube Clickbait Titles",
    structure: ["Title Variants", "CTR Score"],
    requiredInputs: ["video_topic", "keywords"],
    expectedOutput: "10 catchy titles designed for high CTR."
  },
  prompt_YouTube_ScriptShort: {
    id: "prompt_YouTube_ScriptShort",
    label: "YouTube Shorts Script",
    structure: ["0-3s Hook", "3-50s Value", "50-60s CTA"],
    requiredInputs: ["topic", "key_points"],
    expectedOutput: "A fast-paced script for vertical video."
  },
  prompt_YouTube_ScriptLong: {
    id: "prompt_YouTube_ScriptLong",
    label: "YouTube Long-form Script",
    structure: ["Intro", "Sponsor Segment", "Main Content", "Outro"],
    requiredInputs: ["topic", "detailed_outline"],
    expectedOutput: "A comprehensive script for 10+ minute videos."
  }
};
