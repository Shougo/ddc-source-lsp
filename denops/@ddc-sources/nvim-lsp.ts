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
  requestPosition: LSP.Position;
  // call |getbuf
  suggestPosition: LSP.Position;
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
    const line = await fn.line(args.denops, ".") - 1;
    const requestPosition = {
      line,
      character: args.completePos + args.completeStr.length,
    } satisfies LSP.Position;

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
        requestPosition,
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
    const beforeLine = await denops.eval(
      `getline(".")[:getcurpos()[2]-2]`,
    ) as string;
    if (!beforeLine.endsWith(itemWord)) {
      return;
    }

    // Restore the requested state
    await fn.setline(denops, ".", userData.lineOnRequest);
    await this.setCursor(
      denops,
      userData.requestPosition,
    );

    const lspItem = JSON.parse(userData.lspitem) as LSP.CompletionItem;
    const { textEdit, snippetBody } = CompletionItem.extractTextEdit(
      lspItem,
      params.confirmBehavior,
      {
        start: userData.suggestPosition,
        end: userData.requestPosition,
      },
      userData.lineOnRequest,
      userData.offsetEncoding,
    );

    await this.applyTextEdit(denops, textEdit);
    if (snippetBody) {
      if (params.snippetEngine === "") {
        this.printError(denops, "Snippet engine is not registered!");
      } else {
        await denops.call(
          "denops#callback#call",
          params.snippetEngine,
          snippetBody,
        );
      }
    }

    if (params.enableAdditionalTextEdit && lspItem.additionalTextEdits) {
      await this.applyAdditionalTextEdit(
        denops,
        lspItem.additionalTextEdits,
        userData.offsetEncoding,
      );
    }
  }

  private async setCursor(
    denops: Denops,
    position: LSP.Position,
  ): Promise<void> {
    const lnum = position.line + 1;
    const line = await fn.getline(denops, lnum);
    const col = byteLength(line.slice(0, position.character)) + 1;
    await fn.cursor(denops, lnum, col);
  }

  private async applyTextEdit(
    denops: Denops,
    textEdit: LSP.TextEdit,
  ): Promise<void> {
    await denops.call(
      `luaeval`,
      `vim.lsp.util.apply_text_edits(_A, 0, 'utf-16')`,
      [textEdit],
    );
    const insert_lines = textEdit.newText.split("\n");
    if (insert_lines.length === 1) {
      await this.setCursor(denops, {
        line: textEdit.range.start.line,
        character: textEdit.range.start.character + insert_lines[0].length,
      });
    } else {
      await this.setCursor(denops, {
        line: textEdit.range.start.line + insert_lines.length - 1,
        character: insert_lines[insert_lines.length - 1].length,
      });
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

const ENCODER = new TextEncoder();
function byteLength(
  str: string,
) {
  return ENCODER.encode(str).length;
}
