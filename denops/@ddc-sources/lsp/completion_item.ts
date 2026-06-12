import {
  applyTextEdits,
  getCursor,
  isPositionBefore,
  LineContext,
  linePatch,
  LSP,
  type OffsetEncoding,
  toUtf16Index,
} from "./deps/lsp.ts";
import createSelectText from "./select_text.ts";
import type { ConfirmBehavior, Params, UserData } from "./main.ts";
import * as snippet from "./snippet.ts";

import type { Item, PumHighlight } from "@shougo/ddc-vim/types";

import type { Denops } from "@denops/std";

type ItemDefaults = NonNullable<LSP.CompletionList["itemDefaults"]>;
type EditRange = ItemDefaults["editRange"];

export class CompletionItem {
  static Kind: { [key: number]: string } = {
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

  #clientId: number | string;
  #offsetEncoding: OffsetEncoding;
  #resolvable: boolean;
  #lineOnRequest: string;
  #suggestCharacter: number;
  #requestCharacter: number;
  #cursorLine: number;
  #snippetIndicator: string;

  static isSnippet(
    lspItem: LSP.CompletionItem,
  ): boolean {
    return lspItem.insertTextFormat === LSP.InsertTextFormat.Snippet;
  }

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
    suggestCharacter: number,
    requestCharacter: number,
  ): boolean {
    const textEdit = lspItem.textEdit;
    if (!textEdit) {
      return false;
    }
    const range = "range" in textEdit
      ? textEdit.range
      : textEdit[confirmBehavior];
    return range.start.character < suggestCharacter ||
      range.end.character > requestCharacter;
  }

  static async confirm(
    denops: Denops,
    lspItem: LSP.CompletionItem,
    unresolvedItem: LSP.CompletionItem,
    userData: UserData,
    params: Params,
  ): Promise<void> {
    await this.#restoreRequestedState(denops, userData);

    const ctx = await LineContext.create(denops);
    const [before, after] = this.#getConfirmPatchRange(
      lspItem,
      params.confirmBehavior,
      ctx.character,
      userData.suggestCharacter,
    );

    await this.#applySyncAdditionalTextEdits(
      denops,
      unresolvedItem,
      userData.offsetEncoding,
      params.enableAdditionalTextEdit,
    );

    await this.#expandMainPart(
      denops,
      lspItem,
      params.snippetEngine,
      before,
      after,
    );

    await this.#applyAsyncAdditionalTextEdits(
      denops,
      lspItem,
      unresolvedItem,
      userData.offsetEncoding,
      params.enableResolveItem,
    );

    await this.#executeCommand(denops, userData.clientId, lspItem.command);
  }

  static async #restoreRequestedState(
    denops: Denops,
    userData: UserData,
  ): Promise<void> {
    const ctx = await LineContext.create(denops);
    await linePatch(
      denops,
      ctx.character - userData.suggestCharacter,
      0,
      userData.lineOnRequest.slice(
        userData.suggestCharacter,
        userData.requestCharacter,
      ),
    );
  }

  static #getConfirmPatchRange(
    lspItem: LSP.CompletionItem,
    confirmBehavior: ConfirmBehavior,
    character: number,
    suggestCharacter: number,
  ): [number, number] {
    if (!lspItem.textEdit) {
      return [character - suggestCharacter, 0];
    }
    const range = "range" in lspItem.textEdit
      ? lspItem.textEdit.range
      : lspItem.textEdit[confirmBehavior];
    return [character - range.start.character, range.end.character - character];
  }

  static async #applySyncAdditionalTextEdits(
    denops: Denops,
    unresolvedItem: LSP.CompletionItem,
    offsetEncoding: OffsetEncoding,
    enableAdditionalTextEdit: boolean,
  ): Promise<void> {
    if (enableAdditionalTextEdit && unresolvedItem.additionalTextEdits) {
      await applyTextEdits(
        denops,
        0,
        unresolvedItem.additionalTextEdits,
        offsetEncoding,
      );
    }
  }

  static async #expandMainPart(
    denops: Denops,
    lspItem: LSP.CompletionItem,
    snippetEngine: Params["snippetEngine"],
    before: number,
    after: number,
  ): Promise<void> {
    const insertText = this.getInsertText(lspItem);
    if (this.isSnippet(lspItem)) {
      await linePatch(denops, before, after, "");
      await snippet.expand(denops, insertText, snippetEngine);
    } else {
      await linePatch(denops, before, after, insertText);
    }
  }

  static async #applyAsyncAdditionalTextEdits(
    denops: Denops,
    lspItem: LSP.CompletionItem,
    unresolvedItem: LSP.CompletionItem,
    offsetEncoding: OffsetEncoding,
    enableResolveItem: boolean,
  ): Promise<void> {
    if (
      enableResolveItem &&
      (!unresolvedItem.additionalTextEdits ||
        unresolvedItem.additionalTextEdits.length === 0) &&
      lspItem.additionalTextEdits
    ) {
      const cursor = await getCursor(denops);
      if (
        !lspItem.additionalTextEdits.some((edit: LSP.TextEdit) =>
          isPositionBefore(cursor, edit.range.start)
        )
      ) {
        await applyTextEdits(
          denops,
          0,
          lspItem.additionalTextEdits,
          offsetEncoding,
        );
      }
    }
  }

  static async #executeCommand(
    denops: Denops,
    clientId: number | string,
    command: LSP.Command | undefined,
  ): Promise<void> {
    if (command) {
      await denops.call(
        "luaeval",
        `require("ddc_source_lsp.internal").execute(_A[1], _A[2])`,
        [clientId, command],
      );
    }
  }

  constructor(
    clientId: number | string,
    offsetEncoding: OffsetEncoding,
    resolvable: boolean,
    lineOnRequest: string,
    suggestCharacter: number,
    requestCharacter: number,
    cursorLine: number,
    snippetIndicator: string,
  ) {
    this.#clientId = clientId;
    this.#offsetEncoding = offsetEncoding;
    this.#resolvable = resolvable;
    this.#lineOnRequest = lineOnRequest;
    this.#suggestCharacter = suggestCharacter;
    this.#requestCharacter = requestCharacter;
    this.#cursorLine = cursorLine;
    this.#snippetIndicator = snippetIndicator;
  }

  toDdcItem(
    lspItem: LSP.CompletionItem,
    defaults?: LSP.CompletionList["itemDefaults"],
    enableDisplayDetail?: boolean,
    enableMatchLabel?: boolean,
  ): Item<UserData> | undefined {
    lspItem = this.#fillDefaults(lspItem, defaults);

    let isInvalid = false;
    // validate label
    isInvalid = isInvalid || !lspItem.label;
    // validate range
    if (lspItem.textEdit) {
      const range = "range" in lspItem.textEdit
        ? lspItem.textEdit.range
        : lspItem.textEdit.insert;
      isInvalid = isInvalid || range.start.line !== range.end.line ||
        range.start.line !== this.#cursorLine;
    }
    if (isInvalid) {
      return;
    }

    const word = this.#getWord(lspItem);

    function extractPureLabel(label: string) {
      // NOTE: LSP servers may add decorators in label
      return label.replace(/^[•\s]+|[•\s]+$/g, "");
    }

    if (enableMatchLabel && !word.includes(extractPureLabel(lspItem.label))) {
      return;
    }

    const { abbr, highlights } = this.#getAbbr(lspItem);
    const index: keyof typeof CompletionItem.Kind = lspItem.kind ?? 1;
    return {
      word: createSelectText(word),
      abbr,
      kind: CompletionItem.Kind[index],
      menu: enableDisplayDetail ? (lspItem.detail ?? "") : "",
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

  #fillDefaults(
    lspItem: LSP.CompletionItem,
    defaults?: LSP.CompletionList["itemDefaults"],
  ): LSP.CompletionItem {
    if (!defaults) {
      return lspItem;
    }

    const textEdit = lspItem.textEdit ??
      this.#fillTextEditFromDefaults(lspItem, defaults.editRange);

    const { editRange: _editRange, ...restDefaults } = defaults;
    return {
      ...restDefaults,
      ...lspItem,
      ...(textEdit ? { textEdit } : {}),
    };
  }

  #fillTextEditFromDefaults(
    lspItem: LSP.CompletionItem,
    editRange?: EditRange,
  ): LSP.CompletionItem["textEdit"] {
    if (lspItem.textEdit) {
      return lspItem.textEdit;
    }
    if (!editRange) {
      return;
    }

    if ("insert" in editRange) {
      return {
        ...editRange,
        newText: lspItem.textEditText ?? lspItem.label,
      };
    }
    return {
      range: editRange,
      newText: lspItem.textEditText ?? lspItem.label,
    };
  }

  #getWord(
    lspItem: LSP.CompletionItem,
  ): string {
    // NOTE: Use label instead of filterText
    // Because filterText is used for filtering
    // For example:
    // label = "read_dir()"
    // filterText = "read_dirls"

    // NOTE: Use insertText instead of label
    // Because label is used for display
    // For example:
    // label = "•atan2"
    // insertText = "atan2"

    const text = lspItem.insertText ?? lspItem.label.trim();

    const defaultOffset = this.#suggestCharacter;
    let offset = this.#getOffset(lspItem, defaultOffset);
    if (offset < defaultOffset) {
      const prefix = this.#lineOnRequest.slice(offset, defaultOffset);
      if (!text.startsWith(prefix)) {
        offset = defaultOffset;
      }
    }
    const fixedLine = this.#lineOnRequest.slice(0, offset) + text;
    return fixedLine.slice(defaultOffset);
  }

  #getOffset(
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

  #getAbbr(
    lspItem: LSP.CompletionItem,
  ): { abbr: string; highlights?: PumHighlight[] } {
    const abbr = lspItem.insertTextFormat === LSP.InsertTextFormat.Snippet
      ? `${lspItem.label}${this.#snippetIndicator}`
      : lspItem.label;
    return {
      abbr,
      highlights: this.#isDeprecated(lspItem)
        ? [{
          type: "abbr",
          // NOTE: The property 'name' only makes sense in Vim.
          name: `ddc-source-lsp-deprecated`,
          hl_group: "DdcLspDeprecated",
          col: 1,
          width: byteLength(abbr),
        }]
        : [],
    };
  }

  #isDeprecated(
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
