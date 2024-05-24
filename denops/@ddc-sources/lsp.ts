import {
  BaseSource,
  DdcGatherItems,
  GatherArguments,
  GetPreviewerArguments,
  Item,
  OnCompleteDoneArguments,
  Previewer,
} from "../ddc-source-lsp/deps/ddc.ts";
import { Denops, fn, op } from "../ddc-source-lsp/deps/denops.ts";
import {
  LineContext,
  LSP,
  makePositionParams,
  OffsetEncoding,
  parseSnippet,
} from "../ddc-source-lsp/deps/lsp.ts";
import { DeadlineError } from "../ddc-source-lsp/deps/std.ts";
import { is, u } from "../ddc-source-lsp/deps/unknownutil.ts";
import { CompletionItem } from "../ddc-source-lsp/completion_item.ts";
import { request } from "../ddc-source-lsp/request.ts";
import { Client, getClients } from "../ddc-source-lsp/client.ts";

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
  enableResolveItem: boolean;
  enableAdditionalTextEdit: boolean;
  lspEngine: "nvim-lsp" | "vim-lsp" | "lspoints";
  snippetEngine:
    | string // ID of denops#callback.
    | ((body: string) => Promise<void>);
  snippetIndicator: string;
  bufnr?: number;
};

function isDefined<T>(x: T | undefined): x is T {
  return x !== undefined;
}

function splitLines(str: string): string[] {
  return str.replaceAll(/\r\n?/g, "\n").split("\n");
}

export class Source extends BaseSource<Params> {
  #item_cache: Record<Client["id"], Item<UserData>[]> = {};

  override async gather(
    args: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>> {
    const denops = args.denops;

    const lineOnRequest = await fn.getline(denops, ".");
    let isIncomplete = false;
    const cursorLine = (await fn.line(denops, ".")) - 1;

    const clients = await getClients(
      denops,
      args.sourceParams.lspEngine,
      args.sourceParams.bufnr,
    ).catch(() => []);

    const items = await Promise.all(clients.map(async (client) => {
      if (this.#item_cache[client.id]) {
        return this.#item_cache[client.id];
      }

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
      const items = completionList.items.map((lspItem: Item) =>
        completionItem.toDdcItem(
          lspItem,
          completionList.itemDefaults,
          args.sourceParams.enableDisplayDetail,
        )
      ).filter(isDefined);
      if (!completionList.isIncomplete) {
        this.#item_cache[client.id] = items;
      }
      isIncomplete = isIncomplete || completionList.isIncomplete;

      return items;
    })).then((items) => items.flat(1))
      .catch((e) => {
        this.#printError(denops, e);
        return [];
      });

    if (!isIncomplete) {
      this.#item_cache = {};
    }

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
    const params = await makePositionParams(
      denops,
      args.sourceParams.bufnr,
      undefined,
      client.offsetEncoding,
    ) as LSP.CompletionParams;
    const trigger = args.context.input.slice(-1);
    if (client.provider.triggerCharacters?.includes(trigger)) {
      params.context = {
        triggerKind: LSP.CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: trigger,
      };
    } else {
      params.context = {
        triggerKind: args.isIncomplete
          ? LSP.CompletionTriggerKind.TriggerForIncompleteCompletions
          : LSP.CompletionTriggerKind.Invoked,
      };
    }

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
      if (!(e instanceof DeadlineError)) {
        throw e;
      }
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

    // If item.word is sufficient, do not confirm()
    if (
      CompletionItem.getInsertText(lspItem) !== itemWord ||
      (params.enableAdditionalTextEdit &&
        lspItem.additionalTextEdits) ||
      CompletionItem.isReplace(
        lspItem,
        params.confirmBehavior,
        userData.suggestCharacter,
        userData.requestCharacter,
      )
    ) {
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
      const { result } = u.ensure(
        response,
        is.ObjectOf({ result: is.ObjectOf({ label: is.String }) }),
      );
      return result as LSP.CompletionItem;
    } catch {
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
    const contents: string[] = [];

    // snippet
    if (lspItem.kind === 15) {
      const insertText = CompletionItem.getInsertText(lspItem);
      const body = parseSnippet(insertText);
      return {
        kind: "markdown",
        contents: [
          "```" + filetype,
          ...body.replaceAll(/\r\n?/g, "\n").split("\n"),
          "```",
        ],
      };
    }

    // detail
    if (lspItem.detail) {
      contents.push(
        "```" + filetype,
        ...splitLines(lspItem.detail),
        "```",
      );
    }

    // import from (denols)
    if (
      is.ObjectOf({
        tsc: is.ObjectOf({
          source: is.String,
        }),
      })(unresolvedItem.data)
    ) {
      if (contents.length > 0) {
        contents.push("---");
      }
      contents.push(`import from \`${unresolvedItem.data.tsc.source}\``);
    }

    // documentation
    if (
      (typeof lspItem.documentation === "string" &&
        lspItem.documentation.length > 0) ||
      (typeof lspItem.documentation === "object" &&
        lspItem.documentation.value.length > 0)
    ) {
      if (contents.length > 0) {
        contents.push("---");
      }
      contents.push(...this.converter(lspItem.documentation));
    }

    return { kind: "markdown", contents };
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
      enableResolveItem: false,
      lspEngine: "nvim-lsp",
      snippetEngine: "",
      snippetIndicator: "~",
    };
  }
}
