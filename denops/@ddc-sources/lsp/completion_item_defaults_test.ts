import { CompletionItem } from "./completion_item.ts";
import type { LSP, OffsetEncoding } from "./deps/lsp.ts";

import { assertEquals } from "@std/assert/equals";
import { assertExists } from "@std/assert/exists";

Deno.test("toDdcItem does not mutate original completion item on defaults fill", () => {
  const completionItem = new CompletionItem(
    1,
    "utf-16" as const satisfies OffsetEncoding,
    false,
    "fo",
    0,
    2,
    0,
    "~",
  );

  const lspItem: LSP.CompletionItem = {
    label: "foo",
    textEditText: "foo",
  };
  const defaults: LSP.CompletionList["itemDefaults"] = {
    editRange: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 2 },
    },
  };

  const ddcItem = completionItem.toDdcItem(lspItem, defaults);
  assertExists(ddcItem);
  assertEquals(lspItem.textEdit, undefined);

  const userDataItem = JSON.parse(
    ddcItem.user_data!.lspitem,
  ) as LSP.CompletionItem;
  assertExists(userDataItem.textEdit);
  assertEquals(userDataItem.textEdit.newText, "foo");
  if ("range" in userDataItem.textEdit) {
    assertEquals(userDataItem.textEdit.range.start.character, 0);
    assertEquals(userDataItem.textEdit.range.end.character, 2);
  } else {
    assertEquals(userDataItem.textEdit.insert.start.character, 0);
    assertEquals(userDataItem.textEdit.insert.end.character, 2);
  }
});
