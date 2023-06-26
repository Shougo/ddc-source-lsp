import { Denops, Item, LSP } from "./deps.ts";
import { ConfirmBehavior, UserData } from "../@ddc-sources/nvim-lsp.ts";
import { decodeUtfIndex, OffsetEncoding } from "./offset_encoding.ts";

export default class CompletionItem {
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
  #completePos: number;

  constructor(
    clientId: number,
    offsetEncoding: OffsetEncoding,
    resolvable: boolean,
    lineOnRequest: string,
    completePos: number,
  ) {
    this.#clientId = clientId;
    this.#offsetEncoding = offsetEncoding;
    this.#resolvable = resolvable;
    this.#lineOnRequest = lineOnRequest;
    this.#completePos = completePos;
  }

  toDdcItem(
    lspItem: LSP.CompletionItem,
    defaults?: LSP.CompletionList["itemDefaults"],
  ): Item<UserData> {
    lspItem = this.fillDefaults(lspItem, defaults);
    return {
      word: this.getWord(lspItem),
      abbr: this.getAbbr(lspItem),
      kind: CompletionItem.Kind[lspItem.kind ?? 1],
      user_data: {
        lspitem: JSON.stringify(lspItem),
        clientId: this.#clientId,
        resolvable: this.#resolvable,
        lineOnRequest: this.#lineOnRequest,
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
    const filterText = lspItem.filterText ?? lspItem.label;
    const offset = this.getOffset(lspItem) ?? this.#completePos;
    const fixedLine = this.#lineOnRequest.slice(0, offset) + filterText;
    return fixedLine.slice(this.#completePos);
  }

  private getOffset(
    lspItem: LSP.CompletionItem,
  ) {
    const textEdit = lspItem.textEdit;
    if (textEdit === undefined) {
      return;
    }
    const range = "range" in textEdit ? textEdit.range : textEdit.insert;
    const character = range.start.character;
    return decodeUtfIndex(this.#lineOnRequest, character, this.#offsetEncoding);
  }

  private getAbbr(
    lspItem: LSP.CompletionItem,
  ) {
    if (this.getInsertTextFormat(lspItem) === LSP.InsertTextFormat.Snippet) {
      return `${lspItem.label}~`;
    }
    return lspItem.label;
  }

  private getInsertTextFormat(
    lspItem: LSP.CompletionItem,
  ) {
    return lspItem.insertTextFormat ??
      LSP.InsertTextFormat.PlainText;
  }
}
