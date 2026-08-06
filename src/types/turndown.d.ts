// Minimal typed declarations for the untyped `turndown` and
// `turndown-plugin-gfm` dependencies. Covers only the API surface used by the
// report export (DailyReport). Rule callbacks receive a DOM node and the
// turndown-processed content string.
declare module "turndown" {
  export interface TurndownOptions {
    headingStyle?: "atx" | "setext";
    codeBlockStyle?: "indented" | "fenced";
    bulletListMarker?: "-" | "*";
    [key: string]: unknown;
  }

  export interface TurndownRule {
    filter: (node: HTMLElement) => boolean;
    replacement: (content: string, node: HTMLElement) => string;
  }

  export default class TurndownService {
    constructor(options?: TurndownOptions);
    use(plugin: unknown): this;
    addRule(name: string, rule: TurndownRule): this;
    turndown(html: string): string;
  }
}

declare module "turndown-plugin-gfm" {
  export const gfm: unknown;
}
