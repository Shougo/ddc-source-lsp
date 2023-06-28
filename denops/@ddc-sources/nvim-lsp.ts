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
  LSP,
  OnCompleteDoneArguments,
  OnInitArguments,
  register,
} from "../ddc-source-nvim-lsp/deps.ts";
import {
  CompletionOptions,
  CompletionParams,
  CompletionTriggerKind,
} from "../ddc-source-nvim-lsp/types.ts";
import { OffsetEncoding } from "../ddc-source-nvim-lsp/offset_encoding.ts";
import CompletionItem from "../ddc-source-nvim-lsp/completion_item.ts";
import LineContext from "../ddc-source-nvim-lsp/line_context.ts";
import linePatch from "../ddc-source-nvim-lsp/line_patch.ts";

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
  override async onInit(
    args: OnInitArguments<Params>,
  ): Promise<void> {
    if (args.sourceParams.enableResolveItem) {
      await args.denops.call(
        "luaeval",
        `require("ddc_nvim_lsp.internal").setup()`,
      );
    }
  }

  override async gather(
    args: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>> {
    const denops = args.denops;

    const lineOnRequest = await fn.getline(denops, ".");
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
          items.push(completionItem.toDdcItem(lspItem));
        }
      } else {
        for (const lspItem of result.items) {
          items.push(completionItem.toDdcItem(lspItem, result.itemDefaults));
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
    // No expansion unless confirmed by pum#map#confirm()
    const itemWord = await denops.eval(`v:completed_item.word`) as string;
    const ctx = await LineContext.create(denops);
    if (!ctx.text.endsWith(itemWord, ctx.character)) {
      return;
    }

    // Set undo point
    await linePatch(
      denops,
      ctx.character - userData.suggestCharacter,
      0,
      itemWord,
    );
    // :h undo-break
    await denops.cmd(`let &undolevels = &undolevels`);

    const lspItem = JSON.parse(userData.lspitem) as LSP.CompletionItem;
    await CompletionItem.confirm(
      denops,
      lspItem,
      userData,
      params,
    );
  }

  override params(): Params {
    return {
      snippetEngine: "",
      enableResolveItem: true,
      enableAdditionalTextEdit: true,
      confirmBehavior: "insert",
    };
  }
}
