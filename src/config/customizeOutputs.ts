import { CopyOutputFormat } from "../core/types";

export interface CustomizeOptions {
  output_format: CopyOutputFormat;
  include_hashtags: boolean;
  include_emojis: boolean;
  include_cta: boolean;
  variant_style: "conservative" | "balanced" | "creative";
  compliance_mode: "strict" | "standard";
}

export const DEFAULT_CUSTOMIZE_OPTIONS: CustomizeOptions = {
  output_format: "markdown",
  include_hashtags: true,
  include_emojis: true,
  include_cta: true,
  variant_style: "balanced",
  compliance_mode: "standard"
};
