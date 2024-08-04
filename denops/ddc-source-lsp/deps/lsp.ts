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
} from "jsr:@uga-rosa/denops-lsputil@~0.9.4";

export * as LSP from "npm:vscode-languageserver-protocol@~3.17.5";
