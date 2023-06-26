import CompletionItem from "./completion_item.ts";
import { assertEquals, LSP } from "./deps.ts";

/**
 * 1|<div>
 * 2|  </d|>
 */
Deno.test({
  name: "toDdcItem",
  fn: () => {
    const buffer = [
      "<div>",
      "  </d>",
    ];
    const cursorPos: LSP.Position = {
      line: 1,
      character: 5,
    };
    const clientId = 0;
    const offsetEncoding = "utf-16";
    const resolvable = false;
    const completionItem = new CompletionItem(
      clientId,
      offsetEncoding,
      resolvable,
      buffer[1],
      cursorPos.character - 1,
    );

    const lspItem = {
      label: "/div",
      textEdit: {
        range: {
          start: { character: 0, line: 1 },
          end: { character: 5, line: 1 },
        },
        newText: "</div",
      },
      kind: 10, // Property
      insertTextFormat: 1, // plaintext
      filterText: "  </div",
    } satisfies LSP.CompletionItem;

    const ddcItem = completionItem.toDdcItem(lspItem);
    assertEquals(ddcItem, {
      word: "div",
      abbr: "/div",
      kind: CompletionItem.Kind[lspItem.kind],
      user_data: {
        lspitem: JSON.stringify(lspItem),
        clientId,
        resolvable,
        lineOnRequest: buffer[1],
      },
    });
  },
});
