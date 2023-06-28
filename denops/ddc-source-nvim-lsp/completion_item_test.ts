import { assertEquals, Denops, fn, LSP, test } from "./test_deps.ts";
import CompletionItem from "./completion_item.ts";
import { OffsetEncoding } from "./offset_encoding.ts";

const ClientId = 0 as const satisfies number;
const OffsetEncoding = "utf-16" as const satisfies OffsetEncoding;
const Resolvable = false as const satisfies boolean;

function setup(args: {
  input: string;
  buffer: string[];
  lspItem: LSP.CompletionItem;
}) {
  const line = args.buffer.findIndex((lineText) => lineText.includes("|"));
  if (line === -1) {
    throw new Error("Invalid buffer: cursor not found");
  }
  const completePos = args.buffer[line].indexOf("|");

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

Deno.test({
  name: "Indent fixing completion (vscode-html-language-server)",
  fn: () => {
    const buffer = [
      "<div>",
      "  </|foo>",
    ];
    const lspItem = {
      label: "/div",
      textEdit: {
        range: makeRange(1, 0, 1, 3),
        newText: "</div",
      },
      kind: 10, // Property
      filterText: "  </div",
    } satisfies LSP.CompletionItem;
    const ddcItem = setup({
      input: "d",
      buffer,
      lspItem,
    });

    assertEquals(ddcItem, {
      word: "div",
      abbr: "/div",
      kind: CompletionItem.Kind[lspItem.kind],
      highlights: undefined,
      user_data: {
        lspitem: JSON.stringify(lspItem),
        clientId: ClientId,
        offsetEncoding: OffsetEncoding,
        resolvable: Resolvable,
        lineOnRequest: buffer[1],
        suggestCharacter: 4,
        requestCharacter: 5,
      },
    });
  },
});
