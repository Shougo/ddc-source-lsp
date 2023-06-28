import { assertEquals, Denops, fn, LSP, test } from "./test_deps.ts";
import CompletionItem from "./completion_item.ts";
import { OffsetEncoding } from "./offset_encoding.ts";
import { Params } from "../@ddc-sources/nvim-lsp.ts";
import { setCursor } from "./line_patch.ts";

const params: Params = {
  snippetEngine: "",
  enableResolveItem: false,
  enableAdditionalTextEdit: true,
  confirmBehavior: "insert",
};

const ClientId = 0 as const satisfies number;
const OffsetEncoding = "utf-16" as const satisfies OffsetEncoding;
const Resolvable = false as const satisfies boolean;

async function setup(args: {
  denops: Denops;
  input: string;
  buffer: string[];
  lspItem: LSP.CompletionItem;
}) {
  const line = args.buffer.findIndex((lineText) => lineText.includes("|"));
  if (line === -1) {
    throw new Error("Invalid buffer: cursor not found");
  }
  const completePos = args.buffer[line].indexOf("|");
  args.buffer[line] = args.buffer[line].replace("|", args.input);

  const bufnr = await fn.bufadd(args.denops, "ddc-nvim-lsp/test");
  await fn.bufload(args.denops, bufnr);
  await fn.deletebufline(args.denops, bufnr, 1, "$");
  await fn.setbufline(args.denops, bufnr, 1, args.buffer);
  await args.denops.cmd(`buffer ${bufnr}`);
  await setCursor(args.denops, {
    line,
    character: completePos + args.input.length,
  });

  const completionItem = new CompletionItem(
    ClientId,
    OffsetEncoding,
    Resolvable,
    args.buffer[line],
    completePos,
    completePos + args.input.length,
  );
  return completionItem.toDdcItem(args.lspItem);
}

function makeRange(
  sl: number,
  sc: number,
  el: number,
  ec: number,
): LSP.Range {
  return {
    start: { line: sl, character: sc },
    end: { line: el, character: ec },
  };
}

test({
  name: "Indent fixing completion (vscode-html-language-server)",
  mode: "nvim",
  fn: async (denops) => {
    const lspItem = {
      label: "/div",
      textEdit: {
        range: makeRange(1, 0, 1, 5),
        newText: "</div",
      },
      kind: 10, // Property
      filterText: "  </div",
    } satisfies LSP.CompletionItem;
    const ddcItem = await setup({
      denops,
      input: "d",
      buffer: [
        "<div>",
        "  </|>",
      ],
      lspItem,
    });

    assertEquals(ddcItem.word, "div");
    assertEquals(ddcItem.abbr, "/div");

    await CompletionItem.confirm(denops, lspItem, ddcItem.user_data!, params);
    assertEquals(await fn.getline(denops, "."), "</div>");
    assertEquals(await fn.getpos(denops, "."), [0, 2, 6, 0]);
  },
});
