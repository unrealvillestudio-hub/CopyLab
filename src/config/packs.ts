import { CopyPackSpec } from "../core/types";

export const COPY_PACKS: Record<string, CopyPackSpec> = {
  social_post_pack: {
    id: "social_post_pack",
    label: "Social Post",
    packType: "social_post",
    jobs: [
      { id: "smpc_hook", label: "Hook", prompt_type: "prompt_SMPC_full", channel: "INSTAGRAM_ORGANICO", outputs: 1 },
      { id: "smpc_body", label: "Body", prompt_type: "prompt_SMPC_full", channel: "INSTAGRAM_ORGANICO", outputs: 1 },
      { id: "cta_variants", label: "CTA Variants", prompt_type: "prompt_SMPC_full", channel: "INSTAGRAM_ORGANICO", outputs: 3 }
    ]
  },
  ad_copy_pack: {
    id: "ad_copy_pack",
    label: "Ad Copy Full",
    packType: "ad_copy",
    jobs: [
      { id: "hook_variants", label: "Hook Variants", prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 3 },
      { id: "copy_short", label: "Short Copy", prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 3 },
      { id: "copy_long", label: "Long Copy", prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 1 },
      { id: "cta_variants", label: "CTA Variants", prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 3 }
    ]
  },
  seo_meta_pack: {
    id: "seo_meta_pack",
    label: "SEO Meta Tags",
    packType: "seo_meta",
    jobs: [
      { id: "title_tags", label: "Title Tags", prompt_type: "prompt_SEO_FullPro", channel: "WEB", outputs: 3 },
      { id: "meta_descriptions", label: "Meta Descriptions", prompt_type: "prompt_SEO_FullPro", channel: "WEB", outputs: 3 },
      { id: "slug", label: "URL Slug", prompt_type: "prompt_SEO_FullPro", channel: "WEB", outputs: 1 }
    ]
  },
  youtube_pack: {
    id: "youtube_pack",
    label: "YouTube Full",
    packType: "script_brief",
    jobs: [
      { id: "ideas", label: "Video Ideas", prompt_type: "prompt_YouTube_Ideas", channel: "YOUTUBE", outputs: 5 },
      { id: "titles", label: "Clickbait Titles", prompt_type: "prompt_YouTube_Titles", channel: "YOUTUBE", outputs: 10 },
      { id: "script_short", label: "Short Script", prompt_type: "prompt_YouTube_ScriptShort", channel: "YOUTUBE", outputs: 1 },
      { id: "description", label: "Video Description", prompt_type: "prompt_YouTube_ScriptShort", channel: "YOUTUBE", outputs: 1 }
    ]
  },
  email_pack: {
    id: "email_pack",
    label: "Email Campaign",
    packType: "email_subject",
    jobs: [
      { id: "subject_lines", label: "Subject Lines", prompt_type: "prompt_Ads_FullPro", channel: "EMAIL", outputs: 5 },
      { id: "preview_text", label: "Preview Text", prompt_type: "prompt_Ads_FullPro", channel: "EMAIL", outputs: 3 },
      { id: "cta_variants", label: "CTA Variants", prompt_type: "prompt_Ads_FullPro", channel: "EMAIL", outputs: 3 }
    ]
  },
  blog_pack: {
    id: "blog_pack",
    label: "Blog Article",
    packType: "blog_outline",
    jobs: [
      { id: "outline", label: "Outline", prompt_type: "prompt_SEO_FullPro", channel: "BLOG", outputs: 1 },
      { id: "intro", label: "Introduction", prompt_type: "prompt_SEO_FullPro", channel: "BLOG", outputs: 1 },
      { id: "meta_tags", label: "Meta Tags", prompt_type: "prompt_SEO_FullPro", channel: "BLOG", outputs: 1 }
    ]
  },
  video_podcast_script: {
    id: "video_podcast_script",
    label: "VideoPodcast Script",
    packType: "video_podcast",
    jobs: [
      { id: "episode_hook", label: "Episode Hook", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 3 },
      { id: "intro_personas", label: "Intro Personas", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "qa_blocks", label: "Q&A Blocks", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "key_takeaway", label: "Key Takeaway", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "cta_close", label: "CTA Close", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "youtube_description", label: "YouTube Description", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "social_clips", label: "Social Clips", prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 3 }
    ]
  }
};
