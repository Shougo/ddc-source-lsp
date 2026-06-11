import {
  LineContext,
  LSP,
  type OffsetEncoding,
  parseSnippet,
  uriFromBufnr,
} from "./deps/lsp.ts";
import { CompletionItem } from "./completion_item.ts";
import { request } from "./request.ts";
import { type Client, getClients } from "./client.ts";

import type { DdcGatherItems, Previewer } from "@shougo/ddc-vim/types";
import {
  BaseSource,
  type GatherArguments,
  type GetPreviewerArguments,
  type OnCompleteDoneArguments,
} from "@shougo/ddc-vim/source";

import type { Denops } from "@denops/std";
import * as fn from "@denops/std/function";
import * as op from "@denops/std/option";

import { ensure } from "@core/unknownutil/ensure";
import { is } from "@core/unknownutil/is";

type Result = LSP.CompletionList | LSP.CompletionItem[];

export type ConfirmBehavior = "insert" | "replace";

export type UserData = {
  lspitem: string;
  clientId: number | string;
  offsetEncoding: OffsetEncoding;
  resolvable: boolean;
  // e.g.
  // call getbuf
  lineOnRequest: string;
  // call getbuf|
  //            ^
  requestCharacter: number;
  // call |getbuf
  //      ^
  suggestCharacter: number;
};

export type Params = {
  confirmBehavior: ConfirmBehavior;
  enableDisplayDetail: boolean;
  enableMatchLabel: boolean;
  enableResolveItem: boolean;
  enableAdditionalTextEdit: boolean;
  lspEngine: "nvim-lsp" | "vim-lsp" | "lspoints";
  manualOnlyServers: string[];
  snippetEngine:
    | string // ID of denops#callback.
    | ((body: string) => Promise<void>);
  snippetIndicator: string;
  bufnr?: number;
};

function isDefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

const _ENCODER = new TextEncoder();
const _DECODER = new TextDecoder();

/**
 * Convert a UTF-8 byte offset within a line to the character offset expected
 * by the LSP positionEncoding.  For "utf-16" (the common default) this counts
 * UTF-16 code units; for "utf-8" it returns the byte offset unchanged; for
 * "utf-32" it counts Unicode code points.
 *
 * Vim's col('.') returns a 1-indexed byte offset.  Callers should pass
 * `col('.') - 1` (i.e. the 0-indexed byte offset) as `byteOffset`.
 */
export function byteOffsetToCharacter(
  line: string,
  byteOffset: number,
  offsetEncoding: OffsetEncoding,
): number {
  if (offsetEncoding === "utf-8") {
    return byteOffset;
  }
  const bytes = _ENCODER.encode(line);
  const prefix = _DECODER.decode(bytes.slice(0, byteOffset));
  if (offsetEncoding === "utf-32") {
    // Count Unicode code points (spreads surrogate pairs into single entries)
    return [...prefix].length;
  }
  // "utf-16": JavaScript string .length equals the number of UTF-16 code units
  return prefix.length;
}

function splitLines(str: string): string[] {
  return str.replaceAll(/\r\n?/g, "\n").split("\n");
}

function createCompletionContext(
  triggerCharacters: string[] | undefined,
  trigger: string,
  isIncomplete: boolean,
): LSP.CompletionContext {
  if (triggerCharacters?.includes(trigger)) {
    return {
      triggerKind: LSP.CompletionTriggerKind.TriggerCharacter,
      triggerCharacter: trigger,
    };
  }
  return {
    triggerKind: isIncomplete
      ? LSP.CompletionTriggerKind.TriggerForIncompleteCompletions
      : LSP.CompletionTriggerKind.Invoked,
  };
}

export class Source extends BaseSource<Params> {
  override async gather(
    args: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>> {
    const denops = args.denops;

    if (denops.meta.host === "nvim" && !await fn.has(denops, "nvim-0.11")) {
      this.#printError(denops, "ddc-source-lsp requires Neovim 0.11+.");
      return [];
    }

    const lineOnRequest = await fn.getline(denops, ".");
    let isIncomplete = false;
    const cursorLine = (await fn.line(denops, ".")) - 1;

    const clients = (await getClients(
      denops,
      args.sourceParams.lspEngine,
      args.sourceParams.bufnr,
    ).catch(() => [])).filter((client) =>
      args.context.event === "Manual" ||
      !args.sourceParams.manualOnlyServers.includes(client.name)
    );

    const items = await Promise.all(clients.map(async (client) => {
      const result = await this.#request(denops, client, args);
      if (!result) {
        return [];
      }

      const completionItem = new CompletionItem(
        client.id,
        client.offsetEncoding,
        client.provider.resolveProvider === true,
        lineOnRequest,
        args.completePos,
        args.completePos + args.completeStr.length,
        cursorLine,
        args.sourceParams.snippetIndicator,
      );

      const completionList = Array.isArray(result)
        ? { items: result, isIncomplete: false }
        : result;
      const items = completionList.items.map((lspItem: LSP.CompletionItem) =>
        completionItem.toDdcItem(
          lspItem,
          completionList.itemDefaults,
          args.sourceParams.enableDisplayDetail,
          args.sourceParams.enableMatchLabel,
        )
      ).filter(isDefined);
      isIncomplete = isIncomplete || completionList.isIncomplete;

      return items;
    })).then((items) => items.flat(1))
      .catch((e) => {
        this.#printError(denops, e);
        return [];
      });

    return {
      items,
      isIncomplete,
    };
  }

  async #request(
    denops: Denops,
    client: Client,
    args: GatherArguments<Params>,
  ): Promise<Result | undefined> {
    const bufnr = args.sourceParams.bufnr ?? await fn.bufnr(denops);
    const uri = await uriFromBufnr(denops, bufnr);
    const cursorLine = (await fn.line(denops, ".")) - 1; // 0-indexed
    const lineText = await fn.getline(denops, ".");
    const byteCol = (await fn.col(denops, ".")) - 1; // 0-indexed byte offset
    const character = byteOffsetToCharacter(
      lineText,
      byteCol,
      client.offsetEncoding,
    );
    const params: LSP.CompletionParams = {
      textDocument: { uri },
      position: { line: cursorLine, character },
    };
    const trigger = args.context.input.slice(-1);
    params.context = createCompletionContext(
      client.provider.triggerCharacters,
      trigger,
      args.isIncomplete,
    );

    try {
      return await request(
        denops,
        args.sourceParams.lspEngine,
        "textDocument/completion",
        params,
        {
          client,
          timeout: args.sourceOptions.timeout,
          sync: false,
          bufnr: args.sourceParams.bufnr,
        },
      ) as Result;
    } catch (e) {
      if (e instanceof DOMException) {
        return;
      }
      await this.#printError(
        denops,
        `completion request failed: client=${client.name}(${client.id}), error=${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      throw e;
    }
  }

  async #printError(
    denops: Denops,
    message: Error | string,
  ) {
    await denops.call(
      `ddc#util#print_error`,
      message.toString(),
      "ddc-source-lsp",
    );
  }

  override async onCompleteDone({
    denops,
    userData,
    sourceParams: params,
  }: OnCompleteDoneArguments<Params, UserData>): Promise<void> {
    // No expansion unless confirmed by pum#map#confirm() or complete_CTRL-Y
    // (native confirm)
    const itemWord = await denops.eval(`v:completed_item.word`) as string;
    const ctx = await LineContext.create(denops);
    if (ctx.text.slice(userData.suggestCharacter, ctx.character) !== itemWord) {
      return;
    }

    const unresolvedItem = JSON.parse(userData.lspitem) as LSP.CompletionItem;
    const lspItem = params.enableResolveItem
      ? await this.#resolve(
        denops,
        params.lspEngine,
        userData.clientId,
        unresolvedItem,
      )
      : unresolvedItem;

    if (
      !this.#shouldConfirm(lspItem, unresolvedItem, itemWord, params, userData)
    ) {
      return;
    }

    // Set undo point
    // :h undo-break
    await denops.cmd(`let &undolevels = &undolevels`);

    await CompletionItem.confirm(
      denops,
      lspItem,
      unresolvedItem,
      userData,
      params,
    );

    await denops.call("ddc#skip_next_complete");
  }

  #shouldConfirm(
    lspItem: LSP.CompletionItem,
    unresolvedItem: LSP.CompletionItem,
    itemWord: string,
    params: Params,
    userData: UserData,
  ): boolean {
    const hasAdditionalTextEdits = params.enableAdditionalTextEdit &&
      ((unresolvedItem.additionalTextEdits?.length ?? 0) > 0 ||
        (lspItem.additionalTextEdits?.length ?? 0) > 0);
    return CompletionItem.getInsertText(lspItem) !== itemWord ||
      hasAdditionalTextEdits ||
      CompletionItem.isReplace(
        lspItem,
        params.confirmBehavior,
        userData.suggestCharacter,
        userData.requestCharacter,
      );
  }

  async #resolve(
    denops: Denops,
    lspEngine: Params["lspEngine"],
    clientId: number | string,
    lspItem: LSP.CompletionItem,
    bufnr?: number,
  ): Promise<LSP.CompletionItem> {
    const clients = await getClients(denops, lspEngine, bufnr);
    const client = clients.find((c) => c.id === clientId);
    if (!client?.provider.resolveProvider) {
      return lspItem;
    }
    try {
      const response = await request(
        denops,
        lspEngine,
        "completionItem/resolve",
        lspItem,
        { client, timeout: 1000, sync: true, bufnr: bufnr },
      );
      const result = ensure(
        response,
        is.ObjectOf({ label: is.String }),
      );
      return result as LSP.CompletionItem;
    } catch (e) {
      await this.#printError(
        denops,
        `resolve failed: client=${client.name}(${client.id}), error=${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return lspItem;
    }
  }

  override async getPreviewer({
    denops,
    sourceParams: params,
    item,
  }: GetPreviewerArguments<Params, UserData>): Promise<Previewer> {
    const userData = item.user_data;
    if (userData === undefined) {
      return { kind: "empty" };
    }
    const unresolvedItem = JSON.parse(userData.lspitem) as LSP.CompletionItem;
    const lspItem = await this.#resolve(
      denops,
      params.lspEngine,
      userData.clientId,
      unresolvedItem,
      params.bufnr,
    );
    const filetype = await op.filetype.get(denops);
    const snippetPreview = this.#getSnippetPreview(lspItem, filetype);
    if (snippetPreview) {
      return snippetPreview;
    }

    const contents: string[] = [];
    this.#appendDetail(contents, lspItem, filetype);
    this.#appendImportFrom(contents, unresolvedItem);
    this.#appendDocumentation(contents, lspItem);

    return { kind: "markdown", contents };
  }

  #getSnippetPreview(
    lspItem: LSP.CompletionItem,
    filetype: string,
  ): Previewer | undefined {
    if (lspItem.kind !== 15) {
      return;
    }
    const insertText = CompletionItem.getInsertText(lspItem);
    const body = parseSnippet(insertText);
    return {
      kind: "markdown",
      contents: [
        "```" + filetype,
        ...splitLines(body),
        "```",
      ],
    };
  }

  #appendDetail(
    contents: string[],
    lspItem: LSP.CompletionItem,
    filetype: string,
  ): void {
    if (!lspItem.detail) {
      return;
    }
    contents.push(
      "```" + filetype,
      ...splitLines(lspItem.detail),
      "```",
    );
  }

  #appendImportFrom(
    contents: string[],
    unresolvedItem: LSP.CompletionItem,
  ): void {
    if (
      !is.ObjectOf({
        tsc: is.ObjectOf({
          source: is.String,
        }),
      })(unresolvedItem.data)
    ) {
      return;
    }
    if (contents.length > 0) {
      contents.push("---");
    }
    contents.push(`import from \`${unresolvedItem.data.tsc.source}\``);
  }

  #appendDocumentation(
    contents: string[],
    lspItem: LSP.CompletionItem,
  ): void {
    const documentation = lspItem.documentation;
    if (
      !(typeof documentation === "string" && documentation.length > 0) &&
      !(
        typeof documentation === "object" &&
        documentation !== null &&
        documentation.value.length > 0
      )
    ) {
      return;
    }
    if (contents.length > 0) {
      contents.push("---");
    }
    contents.push(...this.converter(documentation));
  }

  converter(doc: string | LSP.MarkupContent): string[] {
    if (typeof doc === "string") {
      return splitLines(doc);
    } else {
      const value = doc.kind === LSP.MarkupKind.PlainText
        ? `<text>\n${doc.value}\n</text>`
        : doc.value ?? "";
      return splitLines(value);
    }
  }

  override params(): Params {
    return {
      confirmBehavior: "insert",
      enableAdditionalTextEdit: false,
      enableDisplayDetail: false,
      enableMatchLabel: false,
      enableResolveItem: false,
      lspEngine: "nvim-lsp",
      manualOnlyServers: [],
      snippetEngine: "",
      snippetIndicator: "~",
    };
  }
}
