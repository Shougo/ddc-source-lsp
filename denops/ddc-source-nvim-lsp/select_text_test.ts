import createSelectText from "./select_text.ts";
import { assertEquals } from "./deps.ts";

Deno.test({
  name: "parse snippet",
  fn: () => {
    const text = `function $1($2)\n\t$0\nend`;
    assertEquals(createSelectText(text), `function`);
  },
});
