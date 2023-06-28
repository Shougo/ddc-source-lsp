import { assertEquals, Denops, LSP, nvim, test } from "./test_deps.ts";
import CompletionItem from "./completion_item.ts";
import { OffsetEncoding } from "./offset_encoding.ts";
import { Params } from "../@ddc-sources/nvim-lsp.ts";
import { byteLength } from "./line_patch.ts";

const params: Params = {
  snippetEngine: "",
  enableResolveItem: false,
  enableAdditionalTextEdit: true,
  confirmBehavior: "insert",
};

const ClientId = 0 as const satisfies number;
const OffsetEncoding = "utf-16" as const satisfies OffsetEncoding;
const Resolvable = false as const satisfies boolean;

// (1,0)-index, byte
function searchCursor(
  buffer: string[],
  insert: string,
): { row: number; col: number; completePos: number } {
  const line = buffer.findIndex((text) => text.includes("|"));
  if (line === -1) {
    throw new Error("Invalid buffer: cursor not found");
  }
  const completePos = buffer[line].indexOf("|");
  buffer[line] = buffer[line].replace("|", insert);
  const col = byteLength(buffer[line].slice(0, completePos) + insert);
  return { row: line + 1, col, completePos };
}

async function setup(args: {
  denops: Denops;
  input: string;
  buffer: string[];
  lspItem: LSP.CompletionItem;
}) {
  const { row, col, completePos } = searchCursor(args.buffer, args.input);

  await nvim.nvim_buf_set_lines(args.denops, 0, 0, -1, true, args.buffer);
  await nvim.nvim_win_set_cursor(args.denops, 0, [row, col]);

  const completionItem = new CompletionItem(
    ClientId,
    OffsetEncoding,
    Resolvable,
    args.buffer[row - 1],
    completePos,
    completePos + args.input.length,
  );
  return completionItem.toDdcItem(args.lspItem);
}

async function assertBuffer(
  denops: Denops,
  buffer: string[],
) {
  const { row, col } = searchCursor(buffer, "");

  const actualBuffer = await nvim.nvim_buf_get_lines(denops, 0, 0, -1, true);
  assertEquals(actualBuffer, buffer);
  const actualCursor = await nvim.nvim_win_get_cursor(denops, 0);
  assertEquals(actualCursor, [row, col]);
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

    assertBuffer(denops, [
      "<div>",
      "</div|>",
    ]);
  },
});
