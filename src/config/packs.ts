import { CopyPackSpec } from "../core/types";

export const COPY_PACKS: Record<string, CopyPackSpec> = {
  // ─── EMAIL SEQUENCES ──────────────────────────────────────────────────────
  email_sequence_abandoned_cart: {
    id: "email_sequence_abandoned_cart",
    label: "Email · Abandoned Cart",
    packType: "email_sequence",
    jobs: [
      { id: "cart_a_es", label: "Cart A — ES", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "abandoned_cart", position: 1, language: "ES", motor: "claude", psycho_presets: ["PSY-TRUST","PSY-AUTHORITY","PSY-FOMO"], mechanism_primary: "authority_problem_reveal", klaviyo_template_slot: "cart_a_es" } },
      { id: "cart_a_en", label: "Cart A — EN", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "abandoned_cart", position: 1, language: "EN", motor: "claude", psycho_presets: ["PSY-TRUST","PSY-AUTHORITY","PSY-FOMO"], mechanism_primary: "authority_problem_reveal", klaviyo_template_slot: "cart_a_en" } },
      { id: "cart_b_es", label: "Cart B — ES", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "abandoned_cart", position: 2, language: "ES", motor: "claude", psycho_presets: ["PSY-SOCIAL-PROOF","PSY-SCARCITY","PSY-BELONGING"], mechanism_primary: "social_proof_opportunity_scarcity", depends_on: ["cart_a_es"], klaviyo_template_slot: "cart_b_es" } },
      { id: "cart_b_en", label: "Cart B — EN", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "abandoned_cart", position: 2, language: "EN", motor: "claude", psycho_presets: ["PSY-SOCIAL-PROOF","PSY-SCARCITY","PSY-BELONGING"], mechanism_primary: "social_proof_opportunity_scarcity", depends_on: ["cart_a_en"], klaviyo_template_slot: "cart_b_en" } },
    ],
  },

  email_sequence_welcome: {
    id: "email_sequence_welcome",
    label: "Email · Welcome",
    packType: "email_sequence",
    jobs: [
      { id: "welcome_es", label: "Welcome — ES", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "welcome", position: 1, language: "ES", motor: "claude", psycho_presets: ["PSY-BELONGING","PSY-ASPIRATION","PSY-TRUST"], mechanism_primary: "belonging_aspiration", klaviyo_template_slot: "welcome_es" } },
      { id: "welcome_en", label: "Welcome — EN", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "welcome", position: 1, language: "EN", motor: "claude", psycho_presets: ["PSY-BELONGING","PSY-ASPIRATION","PSY-TRUST"], mechanism_primary: "belonging_aspiration", klaviyo_template_slot: "welcome_en" } },
    ],
  },

  email_sequence_post_purchase: {
    id: "email_sequence_post_purchase",
    label: "Email · Post Purchase",
    packType: "email_sequence",
    jobs: [
      { id: "post_purchase_es", label: "Post Purchase — ES", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "post_purchase", position: 1, language: "ES", motor: "claude", psycho_presets: ["PSY-BELONGING","PSY-IDENTITY","PSY-ASPIRATION"], mechanism_primary: "education_belonging", klaviyo_template_slot: "post_purchase_es" } },
      { id: "post_purchase_en", label: "Post Purchase — EN", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "post_purchase", position: 1, language: "EN", motor: "claude", psycho_presets: ["PSY-BELONGING","PSY-IDENTITY","PSY-ASPIRATION"], mechanism_primary: "education_belonging", klaviyo_template_slot: "post_purchase_en" } },
    ],
  },

  email_sequence_review_request: {
    id: "email_sequence_review_request",
    label: "Email · Review Request",
    packType: "email_sequence",
    jobs: [
      { id: "review_es", label: "Review Request — ES", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "review_request", position: 1, language: "ES", motor: "claude", psycho_presets: ["PSY-SOCIAL-PROOF","PSY-BELONGING"], mechanism_primary: "social_proof_community", klaviyo_template_slot: "review_es" } },
      { id: "review_en", label: "Review Request — EN", prompt_type: "prompt_Email_Sequence", channel: "EMAIL", outputs: 1, meta: { sequence_type: "review_request", position: 1, language: "EN", motor: "claude", psycho_presets: ["PSY-SOCIAL-PROOF","PSY-BELONGING"], mechanism_primary: "social_proof_community", klaviyo_template_slot: "review_en" } },
    ],
  },

  // ─── PRODUCT DESCRIPTION ─────────────────────────────────────────────────
  // Motor: CopyLab /api/execute (PATH B) — kit_components desde product_blueprints
  // Multimarca: funciona para productos simples y kits. El contexto del producto
  // viene en previousOutputs.product desde fetchProductCatalog (queries.ts)
  // Destino: Shopify product description (body_html ES + EN)

  product_description_pack: {
    id: "product_description_pack",
    label: "Product Description",
    packType: "product_description",
    jobs: [
      { id: "desc_es", label: "Descripción — ES", prompt_type: "prompt_Product_Description_B2C", channel: "WEB", outputs: 1, meta: { language: "ES", motor: "claude" } },
      { id: "desc_en", label: "Description — EN", prompt_type: "prompt_Product_Description_B2C", channel: "WEB", outputs: 1, meta: { language: "EN", motor: "claude" } },
    ],
  },

  // ─── EXISTING PACKS ───────────────────────────────────────────────────────

  social_post_pack: {
    id: "social_post_pack",
    label: "Social Post",
    packType: "social_post",
    jobs: [
      { id: "smpc_hook",    label: "Hook",         prompt_type: "prompt_SMPC_full", channel: "INSTAGRAM_ORGANICO", outputs: 1 },
      { id: "smpc_body",    label: "Body",         prompt_type: "prompt_SMPC_full", channel: "INSTAGRAM_ORGANICO", outputs: 1 },
      { id: "cta_variants", label: "CTA Variants", prompt_type: "prompt_SMPC_full", channel: "INSTAGRAM_ORGANICO", outputs: 3 },
    ],
  },

  ad_copy_pack: {
    id: "ad_copy_pack",
    label: "Ad Copy Full",
    packType: "ad_copy",
    jobs: [
      { id: "hook_variants", label: "Hook Variants", prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 3 },
      { id: "copy_short",    label: "Short Copy",    prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 3 },
      { id: "copy_long",     label: "Long Copy",     prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 1 },
      { id: "cta_variants",  label: "CTA Variants",  prompt_type: "prompt_Ads_FullPro", channel: "META_ADS", outputs: 3 },
    ],
  },

  seo_meta_pack: {
    id: "seo_meta_pack",
    label: "SEO Meta Tags",
    packType: "seo_meta",
    jobs: [
      { id: "title_tags",        label: "Title Tags",        prompt_type: "prompt_SEO_FullPro", channel: "WEB", outputs: 3 },
      { id: "meta_descriptions", label: "Meta Descriptions", prompt_type: "prompt_SEO_FullPro", channel: "WEB", outputs: 3 },
      { id: "slug",              label: "URL Slug",          prompt_type: "prompt_SEO_FullPro", channel: "WEB", outputs: 1 },
    ],
  },

  youtube_pack: {
    id: "youtube_pack",
    label: "YouTube Full",
    packType: "script_brief",
    jobs: [
      { id: "ideas",       label: "Video Ideas",      prompt_type: "prompt_YouTube_Ideas",       channel: "YOUTUBE", outputs: 5  },
      { id: "titles",      label: "Clickbait Titles", prompt_type: "prompt_YouTube_Titles",      channel: "YOUTUBE", outputs: 10 },
      { id: "script_short",label: "Short Script",     prompt_type: "prompt_YouTube_ScriptShort", channel: "YOUTUBE", outputs: 1  },
      { id: "description", label: "Video Description",prompt_type: "prompt_YouTube_ScriptShort", channel: "YOUTUBE", outputs: 1  },
    ],
  },

  email_pack: {
    id: "email_pack",
    label: "Email Campaign (standalone)",
    packType: "email_subject",
    jobs: [
      { id: "subject_lines", label: "Subject Lines", prompt_type: "prompt_Ads_FullPro", channel: "EMAIL", outputs: 5 },
      { id: "preview_text",  label: "Preview Text",  prompt_type: "prompt_Ads_FullPro", channel: "EMAIL", outputs: 3 },
      { id: "cta_variants",  label: "CTA Variants",  prompt_type: "prompt_Ads_FullPro", channel: "EMAIL", outputs: 3 },
    ],
  },

  blog_pack: {
    id: "blog_pack",
    label: "Blog Article",
    packType: "blog_outline",
    jobs: [
      { id: "outline",   label: "Outline",       prompt_type: "prompt_SEO_FullPro", channel: "BLOG", outputs: 1 },
      { id: "intro",     label: "Introduction",  prompt_type: "prompt_SEO_FullPro", channel: "BLOG", outputs: 1 },
      { id: "meta_tags", label: "Meta Tags",      prompt_type: "prompt_SEO_FullPro", channel: "BLOG", outputs: 1 },
    ],
  },

  video_podcast_script: {
    id: "video_podcast_script",
    label: "VideoPodcast Script",
    packType: "video_podcast",
    jobs: [
      { id: "episode_hook",       label: "Episode Hook",       prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 3 },
      { id: "intro_personas",     label: "Intro Personas",     prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "qa_blocks",          label: "Q&A Blocks",         prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "key_takeaway",       label: "Key Takeaway",       prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "cta_close",          label: "CTA Close",          prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "youtube_description",label: "YouTube Description",prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 1 },
      { id: "social_clips",       label: "Social Clips",       prompt_type: "prompt_Ads_FullPro", channel: "YOUTUBE", outputs: 3 },
    ],
  },
};
