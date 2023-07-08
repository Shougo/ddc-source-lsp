import {
  applyTextEdits,
  Denops,
  getCursor,
  isPositionBefore,
  Item,
  LineContext,
  linePatch,
  LSP,
  OffsetEncoding,
  PumHighlight,
  toUtf16Index,
} from "./deps.ts";
import createSelectText from "./select_text.ts";
import { ConfirmBehavior, Params, UserData } from "../@ddc-sources/nvim-lsp.ts";

export class CompletionItem {
  static Kind = {
    1: "Text",
    2: "Method",
    3: "Function",
    4: "Constructor",
    5: "Field",
    6: "Variable",
    7: "Class",
    8: "Interface",
    9: "Module",
    10: "Property",
    11: "Unit",
    12: "Value",
    13: "Enum",
    14: "Keyword",
    15: "Snippet",
    16: "Color",
    17: "File",
    18: "Reference",
    19: "Folder",
    20: "EnumMember",
    21: "Constant",
    22: "Struct",
    23: "Event",
    24: "Operator",
    25: "TypeParameter",
  } as const satisfies Record<LSP.CompletionItemKind, string>;

  #clientId: number;
  #offsetEncoding: OffsetEncoding;
  #resolvable: boolean;
  #lineOnRequest: string;
  #suggestCharacter: number;
  #requestCharacter: number;

  static getInsertText(
    lspItem: LSP.CompletionItem,
  ): string {
    return lspItem.textEdit?.newText ??
      lspItem.insertText ??
      lspItem.label;
  }

  static isReplace(
    lspItem: LSP.CompletionItem,
    confirmBehavior: ConfirmBehavior,
  ): boolean {
    const textEdit = lspItem.textEdit;
    if (!textEdit) {
      return false;
    }
    const range = "range" in textEdit
      ? textEdit.range
      : textEdit[confirmBehavior];
    return range.start.character !== range.end.character;
  }

  static async confirm(
    denops: Denops,
    lspItem: LSP.CompletionItem,
    unresolvedItem: LSP.CompletionItem,
    userData: UserData,
    params: Params,
  ): Promise<void> {
    // Restore the requested state
    let ctx = await LineContext.create(denops);
    await linePatch(
      denops,
      ctx.character - userData.suggestCharacter,
      0,
      userData.lineOnRequest.slice(
        userData.suggestCharacter,
        userData.requestCharacter,
      ),
    );

    ctx = await LineContext.create(denops);
    const insertText = CompletionItem.getInsertText(lspItem);
    let before: number, after: number;
    if (!lspItem.textEdit) {
      before = ctx.character - userData.suggestCharacter;
      after = 0;
    } else {
      const range = "range" in lspItem.textEdit
        ? lspItem.textEdit.range
        : lspItem.textEdit[params.confirmBehavior];
      before = ctx.character - range.start.character;
      after = range.end.character - ctx.character;
    }

    // Apply sync additionalTextEdits
    if (params.enableAdditionalTextEdit && unresolvedItem.additionalTextEdits) {
      await applyTextEdits(
        denops,
        0,
        unresolvedItem.additionalTextEdits,
        userData.offsetEncoding,
      );
    }

    // Expand main part
    const isSnippet = lspItem.insertTextFormat === LSP.InsertTextFormat.Snippet;
    if (!isSnippet) {
      await linePatch(denops, before, after, insertText);
    } else {
      await linePatch(denops, before, after, "");
      if (typeof params.snippetEngine === "string") {
        await denops.call(
          "denops#callback#call",
          params.snippetEngine,
          insertText,
        );
      } else {
        await params.snippetEngine({ denops, body: insertText });
      }
    }

    // Apply async additionalTextEdits
    if (
      params.enableResolveItem &&
      unresolvedItem.additionalTextEdits === undefined &&
      lspItem.additionalTextEdits
    ) {
      const cursor = await getCursor(denops);
      if (
        !lspItem.additionalTextEdits.some((edit) =>
          isPositionBefore(cursor, edit.range.start)
        )
      ) {
        await applyTextEdits(
          denops,
          0,
          lspItem.additionalTextEdits,
          userData.offsetEncoding,
        );
      }
    }

    // Execute command
    if (lspItem.command) {
      await denops.call(
        "luaeval",
        `require("ddc_nvim_lsp.internal").execute(_A[1], _A[2])`,
        [userData.clientId, lspItem.command],
      );
    }
  }

  constructor(
    clientId: number,
    offsetEncoding: OffsetEncoding,
    resolvable: boolean,
    lineOnRequest: string,
    suggestCharacter: number,
    requestCharacter: number,
  ) {
    this.#clientId = clientId;
    this.#offsetEncoding = offsetEncoding;
    this.#resolvable = resolvable;
    this.#lineOnRequest = lineOnRequest;
    this.#suggestCharacter = suggestCharacter;
    this.#requestCharacter = requestCharacter;
  }

  toDdcItem(
    lspItem: LSP.CompletionItem,
    defaults?: LSP.CompletionList["itemDefaults"],
  ): Item<UserData> {
    lspItem = this.fillDefaults(lspItem, defaults);
    const { abbr, highlights } = this.getAbbr(lspItem);
    return {
      word: createSelectText(this.getWord(lspItem)),
      abbr,
      kind: CompletionItem.Kind[lspItem.kind ?? 1],
      highlights,
      user_data: {
        lspitem: JSON.stringify(lspItem),
        clientId: this.#clientId,
        offsetEncoding: this.#offsetEncoding,
        resolvable: this.#resolvable,
        lineOnRequest: this.#lineOnRequest,
        suggestCharacter: this.#suggestCharacter,
        requestCharacter: this.#requestCharacter,
      },
    };
  }

  private fillDefaults(
    lspItem: LSP.CompletionItem,
    defaults?: LSP.CompletionList["itemDefaults"],
  ): LSP.CompletionItem {
    if (!defaults) {
      return lspItem;
    }

    if (defaults.editRange && !lspItem.textEdit) {
      if ("insert" in defaults.editRange) {
        lspItem.textEdit = {
          ...defaults.editRange,
          newText: lspItem.textEditText ?? lspItem.label,
        };
      } else {
        lspItem.textEdit = {
          range: defaults.editRange,
          newText: lspItem.textEditText ?? lspItem.label,
        };
      }
    }

    const filledItem = {
      ...defaults,
      ...lspItem,
    };
    delete filledItem.editRange;

    return filledItem;
  }

  private getWord(
    lspItem: LSP.CompletionItem,
  ): string {
    const text = (lspItem.filterText ?? lspItem.label).trim();
    const defaultOffset = this.#suggestCharacter;
    let offset = this.getOffset(lspItem, defaultOffset);
    if (offset < defaultOffset) {
      const prefix = this.#lineOnRequest.slice(offset, defaultOffset);
      if (!text.startsWith(prefix)) {
        offset = defaultOffset;
      }
    }
    const fixedLine = this.#lineOnRequest.slice(0, offset) + text;
    return fixedLine.slice(defaultOffset);
  }

  private getOffset(
    lspItem: LSP.CompletionItem,
    defaultOffset: number,
  ): number {
    const textEdit = lspItem.textEdit;
    if (textEdit === undefined) {
      return defaultOffset;
    }
    const range = "range" in textEdit ? textEdit.range : textEdit.insert;
    const character = range.start.character;
    const offset = toUtf16Index(
      this.#lineOnRequest,
      character,
      this.#offsetEncoding,
    );
    const delta = this.#lineOnRequest.slice(offset, defaultOffset).search(/\S/);
    return offset + (delta > 0 ? delta : 0);
  }

  private getAbbr(
    lspItem: LSP.CompletionItem,
  ): { abbr: string; highlights?: PumHighlight[] } {
    const abbr = lspItem.insertTextFormat === LSP.InsertTextFormat.Snippet
      ? `${lspItem.label}~`
      : lspItem.label;
    return {
      abbr,
      highlights: this.isDeprecated(lspItem)
        ? [{
          type: "abbr",
          // NOTE: The property 'name' only makes sense in Vim.
          name: "",
          hl_group: "DdcNvimLspDeprecated",
          col: 1,
          width: byteLength(abbr),
        }]
        : [],
    };
  }

  private isDeprecated(
    lspItem: LSP.CompletionItem,
  ): boolean {
    return lspItem.deprecated ||
      !!lspItem.tags?.includes(LSP.CompletionItemTag.Deprecated);
  }
}

const ENCODER = new TextEncoder();
export function byteLength(
  s: string,
): number {
  return ENCODER.encode(s).length;
}
