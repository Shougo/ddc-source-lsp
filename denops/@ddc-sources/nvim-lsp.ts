import {
  BaseSource,
  DdcGatherItems,
  fn,
  GatherArguments,
  Item,
  LSP,
  OnCompleteDoneArguments,
  OnInitArguments,
  vars,
} from "../ddc-source-nvim-lsp/deps.ts";
import { OffsetEncoding } from "../ddc-source-nvim-lsp/offset_encoding.ts";
import CompletionItem from "../ddc-source-nvim-lsp/completion_item.ts";

const CompletionTriggerKind = {
  Invoked: 1,
  TriggerCharacter: 2,
  TriggerForIncompleteCompletions: 3,
} as const satisfies Record<string, number>;

type CompletionContext = {
  triggerKind: number;
  triggerCharacter?: string;
};

type CompletionParams = {
  position: LSP.Position;
  context?: CompletionContext;
};

type Response = {
  result: LSP.CompletionItem[] | LSP.CompletionList;
  clientId: number;
  offsetEncoding: OffsetEncoding;
  resolvable: boolean;
}[];

export type UserData = {
  lspitem: string;
  clientId: number;
  resolvable: boolean;
  lineOnRequest: string;
};

export type ConfirmBehavior = "insert" | "replace";

type Params = {
  enableResolveItem: boolean;
  enableAdditionalTextEdit: boolean;
  confirmBehavior: ConfirmBehavior;
};

export class Source extends BaseSource<Params> {
  override async onInit(
    args: OnInitArguments<Params>,
  ): Promise<void> {
    await args.denops.call(
      "luaeval",
      `require("ddc_nvim_lsp.internal").setup(_A)`,
      args.sourceParams,
    );
  }

  override async gather(
    args: GatherArguments<Params>,
  ): Promise<DdcGatherItems<UserData>> {
    const params = await args.denops.call(
      "luaeval",
      "vim.lsp.util.make_position_params()",
    ) as CompletionParams;

    params.context = {
      triggerKind: args.isIncomplete
        ? CompletionTriggerKind.TriggerForIncompleteCompletions
        : CompletionTriggerKind.Invoked,
    };

    const response = await args.denops.call(
      "luaeval",
      `require("ddc_nvim_lsp.internal").request(_A[1], _A[2], _A[3])`,
      [params, args.context.input.slice(-1), args.completeStr.length],
    ) as Response;

    const lineOnRequest = await fn.getline(args.denops, ".");

    const items: Item<UserData>[] = [];
    let isIncomplete = false;

    for (const { clientId, offsetEncoding, result, resolvable } of response) {
      const completionItem = new CompletionItem(
        clientId,
        offsetEncoding,
        resolvable,
        lineOnRequest,
        args.completePos,
      );

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
    }

    return {
      items,
      isIncomplete,
    };
  }

  override async onCompleteDone(
    args: OnCompleteDoneArguments<Params, UserData>,
  ): Promise<void> {
    await args.denops.cmd("echom message", { messange: "hi" });
    // console.log(args.userData);
    // const vimCompletedItem = await vars.v.get(
    //   args.denops,
    //   "completed_item",
    // ) as Item<UserData>;
    // console.log(vimCompletedItem);
  }

  override params(): Params {
    return {
      enableResolveItem: true,
      enableAdditionalTextEdit: true,
      confirmBehavior: "insert",
    };
  }
}
