import {
  BaseSource,
  DdcGatherItems,
  Denops,
  fn,
  GatherArguments,
  Item,
  LSP,
  OnCompleteDoneArguments,
  OnInitArguments,
} from "../ddc-source-nvim-lsp/deps.ts";
import { OffsetEncoding } from "../ddc-source-nvim-lsp/offset_encoding.ts";
import CompletionItem from "../ddc-source-nvim-lsp/completion_item.ts";
import LineContext from "../ddc-source-nvim-lsp/line_context.ts";
import linePatch from "../ddc-source-nvim-lsp/line_patch.ts";

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

export type ConfirmBehavior = "insert" | "replace";

type Params = {
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
    const lineOnRequest = await fn.getline(args.denops, ".");
    const requestCharacter = args.completePos + args.completeStr.length;

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

    const items: Item<UserData>[] = [];
    let isIncomplete = false;

    for (const { clientId, offsetEncoding, result, resolvable } of response) {
      const completionItem = new CompletionItem(
        clientId,
        offsetEncoding,
        resolvable,
        lineOnRequest,
        args.completePos,
        requestCharacter,
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
    const { denops, userData, sourceParams: params } = args;

    // If the user confirms by entering the next input,
    // the expansion process is not performed.
    const itemWord = await denops.eval(`v:completed_item.word`) as string;
    let ctx = await LineContext.create(denops);
    if (
      ctx.text !== userData.lineOnRequest && // use pum#map#select_relative
      !ctx.text.endsWith(itemWord, ctx.character) // use pum#map#insert_relative
    ) {
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

    // Restore the requested state
    ctx = await LineContext.create(denops);
    await linePatch(
      denops,
      ctx.character - userData.suggestCharacter,
      0,
      userData.lineOnRequest.slice(
        userData.suggestCharacter,
        userData.requestCharacter,
      ),
    );

    const lspItem = JSON.parse(userData.lspitem) as LSP.CompletionItem;

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

    // Apply additionalTextEdits
    if (params.enableAdditionalTextEdit && lspItem.additionalTextEdits) {
      await this.applyAdditionalTextEdit(
        denops,
        lspItem.additionalTextEdits,
        userData.offsetEncoding,
      );
    }

    const isSnippet = lspItem.insertTextFormat === LSP.InsertTextFormat.Snippet;
    if (!isSnippet) {
      await linePatch(denops, before, after, insertText);
    } else {
      await linePatch(denops, before, after, "");
      if (params.snippetEngine === "") {
        this.printError(denops, "Snippet engine is not registered!");
      } else {
        await denops.call(
          "denops#callback#call",
          params.snippetEngine,
          insertText,
        );
      }
    }
  }

  private async applyAdditionalTextEdit(
    denops: Denops,
    textEdit: LSP.TextEdit[],
    offsetEncoding: OffsetEncoding,
  ): Promise<void> {
    await denops.call(
      `luaeval`,
      `vim.lsp.util.apply_text_edits(_A[1], 0, _A[2])`,
      [textEdit, offsetEncoding],
    );
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

  override params(): Params {
    return {
      snippetEngine: "",
      enableResolveItem: true,
      enableAdditionalTextEdit: true,
      confirmBehavior: "replace",
    };
  }
}
