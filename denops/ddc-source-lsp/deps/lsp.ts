export {
  applyTextEdits,
  getCursor,
  isPositionBefore,
  LineContext,
  linePatch,
  makePositionParams,
  type OffsetEncoding,
  parseSnippet,
  toUtf16Index,
  uriFromBufnr,
} from "https://deno.land/x/denops_lsputil@v0.9.5/mod.ts";

export * as LSP from "npm:vscode-languageserver-protocol@3.17.5";
