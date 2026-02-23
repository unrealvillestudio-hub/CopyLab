import { CopyChannel, CopyTone, CopyOutputFormat } from "../core/types";

export interface ChannelBlock {
  id: CopyChannel;
  label: string;
  recommendedTone: CopyTone;
  maxLength: number;
  outputFormat: CopyOutputFormat;
  restrictions: string[];
}

export const CHANNEL_BLOCKS: Record<CopyChannel, ChannelBlock> = {
  META_ADS: {
    id: "META_ADS",
    label: "Meta Ads (FB/IG)",
    recommendedTone: "energetic",
    maxLength: 280,
    outputFormat: "plain",
    restrictions: ["No clickbait", "Compliance with FB policies"]
  },
  TIKTOK_ADS: {
    id: "TIKTOK_ADS",
    label: "TikTok Ads",
    recommendedTone: "conversational",
    maxLength: 150,
    outputFormat: "plain",
    restrictions: ["Use trending slang", "Native feel"]
  },
  GOOGLE_SEARCH: {
    id: "GOOGLE_SEARCH",
    label: "Google Search Ads",
    recommendedTone: "authoritative",
    maxLength: 90,
    outputFormat: "plain",
    restrictions: ["Keyword focus", "Character limits strict"]
  },
  GOOGLE_PMAX: {
    id: "GOOGLE_PMAX",
    label: "Google Performance Max",
    recommendedTone: "authoritative",
    maxLength: 90,
    outputFormat: "plain",
    restrictions: ["Varied lengths", "Asset group focus"]
  },
  INSTAGRAM_ORGANICO: {
    id: "INSTAGRAM_ORGANICO",
    label: "Instagram Organic",
    recommendedTone: "warm",
    maxLength: 2200,
    outputFormat: "markdown",
    restrictions: ["Emoji usage", "Hashtag strategy"]
  },
  TIKTOK_ORGANICO: {
    id: "TIKTOK_ORGANICO",
    label: "TikTok Organic",
    recommendedTone: "conversational",
    maxLength: 2200,
    outputFormat: "plain",
    restrictions: ["Hook focus", "Short sentences"]
  },
  YOUTUBE: {
    id: "YOUTUBE",
    label: "YouTube",
    recommendedTone: "energetic",
    maxLength: 5000,
    outputFormat: "markdown",
    restrictions: ["SEO titles", "Timestamp focus"]
  },
  WEB: {
    id: "WEB",
    label: "Website Content",
    recommendedTone: "technical",
    maxLength: 1000,
    outputFormat: "html",
    restrictions: ["UX writing", "Clear CTAs"]
  },
  LANDING_PAGE: {
    id: "LANDING_PAGE",
    label: "Landing Page",
    recommendedTone: "authoritative",
    maxLength: 2000,
    outputFormat: "html",
    restrictions: ["Conversion focus", "Social proof"]
  },
  BLOG: {
    id: "BLOG",
    label: "Blog Post",
    recommendedTone: "warm",
    maxLength: 5000,
    outputFormat: "markdown",
    restrictions: ["SEO optimization", "Readability"]
  },
  EMAIL: {
    id: "EMAIL",
    label: "Email Marketing",
    recommendedTone: "conversational",
    maxLength: 1000,
    outputFormat: "markdown",
    restrictions: ["Subject line focus", "Personalization"]
  }
};
