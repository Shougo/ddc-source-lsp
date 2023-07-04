import {
  BaseSource,
  DdcGatherItems,
  deadline,
  DeadlineError,
  deferred,
  Denops,
  fn,
  GatherArguments,
  Item,
  LineContext,
  LSP,
  OffsetEncoding,
  OnCompleteDoneArguments,
  register,
} from "../ddc-source-nvim-lsp/deps.ts";
import {
  CompletionOptions,
  CompletionParams,
  CompletionTriggerKind,
} from "../ddc-source-nvim-lsp/types.ts";
import { CompletionItem } from "../ddc-source-nvim-lsp/completion_item.ts";

type Client = {
  id: number;
  provider: CompletionOptions;
  offsetEncoding: OffsetEncoding;
};

type Result = LSP.CompletionList | LSP.CompletionItem[];

export type ConfirmBehavior = "insert" | "replace";

export type UserData = {
  lspitem: string;
  clientId: number;
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
  snippetEngine: string; // ID of denops#callback. Required!
  enableResolveItem: boolean;
  enableAdditionalTextEdit: boolean;
  confirmBehavior: ConfirmBehavior;
};

export class Source extends BaseSource<Params> {
  override async gather(
    args: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>> {
    const denops = args.denops;

    const lineOnRequest = await fn.getline(denops, ".");
    const isSnippetEngineRegistered = args.sourceParams.snippetEngine !== "";
    const isValid = (lspItem: LSP.CompletionItem) =>
      isSnippetEngineRegistered ||
      lspItem.kind !== LSP.CompletionItemKind.Snippet;
    let isIncomplete = false;

    const clients = await denops.call(
      "luaeval",
      `require("ddc_nvim_lsp.internal").get_clients()`,
    ) as Client[];

    const items = await Promise.all(clients.map(async (client) => {
      const result = await this.request(denops, client, args);
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
      );

      const items: Item<UserData>[] = [];

      if (Array.isArray(result)) {
        for (const lspItem of result) {
          if (isValid(lspItem)) {
            items.push(completionItem.toDdcItem(lspItem));
          }
        }
      } else {
        for (const lspItem of result.items) {
          if (isValid(lspItem)) {
            items.push(completionItem.toDdcItem(lspItem, result.itemDefaults));
          }
        }
        isIncomplete = isIncomplete || result.isIncomplete;
      }

      return items;
    })).then((items) => items.flat(1))
      .catch((e) => {
        this.printError(denops, e);
        return [];
      });

    return {
      items,
      isIncomplete,
    };
  }

  private async request(
    denops: Denops,
    client: Client,
    args: GatherArguments<Params>,
  ): Promise<Result | undefined> {
    const params = await denops.call(
      "luaeval",
      "vim.lsp.util.make_position_params()",
    ) as CompletionParams;
    const trigger = args.context.input.slice(-1);
    if (client.provider.triggerCharacters?.includes(trigger)) {
      params.context = {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: trigger,
      };
    } else {
      params.context = {
        triggerKind: args.isIncomplete
          ? CompletionTriggerKind.TriggerForIncompleteCompletions
          : CompletionTriggerKind.Invoked,
      };
    }

    try {
      const defer = deferred<Result>();
      const id = register(denops, (response: unknown) => {
        defer.resolve(response as Result);
      });
      await denops.call(
        `luaeval`,
        `require("ddc_nvim_lsp.internal").request(_A[1], _A[2], _A[3])`,
        [client.id, params, { name: denops.name, id }],
      );
      return await deadline(defer, 1_000);
    } catch (e) {
      if (!(e instanceof DeadlineError)) {
        throw e;
      }
    }
  }

  private async printError(
    denops: Denops,
    message: Error | string,
  ) {
    await denops.call(
      `ddc#util#print_error`,
      message.toString(),
      "ddc-source-nvim-lsp",
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
      ? await this.resolve(denops, userData.clientId, unresolvedItem)
      : unresolvedItem;

    // If item.word is sufficient, do not confirm()
    if (
      CompletionItem.getInsertText(lspItem) !== itemWord ||
      (params.enableAdditionalTextEdit &&
        lspItem.additionalTextEdits) ||
      CompletionItem.isReplace(lspItem, params.confirmBehavior)
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
    }
  }

  private async resolve(
    denops: Denops,
    clientId: number,
    lspItem: LSP.CompletionItem,
  ): Promise<LSP.CompletionItem> {
    const resolvedItem = await denops.call(
      "luaeval",
      `require("ddc_nvim_lsp.internal").resolve(_A[1], _A[2])`,
      [clientId, lspItem],
    ) as LSP.CompletionItem | null;
    return resolvedItem ?? lspItem;
  }

  override params(): Params {
    return {
      snippetEngine: "",
      enableResolveItem: false,
      enableAdditionalTextEdit: false,
      confirmBehavior: "insert",
    };
  }
}
