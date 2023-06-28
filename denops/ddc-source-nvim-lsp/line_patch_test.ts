import { assertEquals, Denops, nvim, test } from "./test_deps.ts";
import linePatch from "./line_patch.ts";
import { searchCursor } from "./completion_item_test.ts";

async function setup(
  denops: Denops,
  buffer: string,
) {
  const lines = [buffer];
  const { row, col } = searchCursor(lines, "");
  await nvim.nvim_buf_set_lines(denops, 0, 0, -1, true, lines);
  await nvim.nvim_win_set_cursor(denops, 0, [row, col]);
}

async function assertLine(
  denops: Denops,
  expectedLine: string,
) {
  const actualLine = await nvim.nvim_get_current_line(denops);
  assertEquals(actualLine, expectedLine);
}

test({
  name: "single byte line",
  mode: "nvim",
  fn: async (denops) => {
    await setup(denops, "foo|bar");
    await linePatch(denops, 2, 0, "");
    await assertLine(denops, "fbar");
    await linePatch(denops, 0, 2, "");
    await assertLine(denops, "fr");
  },
});

test({
  name: "multi byte line",
  mode: "nvim",
  fn: async (denops) => {
    await setup(denops, "あいう|😀😀😀");
    await linePatch(denops, 2, 0, "");
    await assertLine(denops, "あ😀😀😀");
    await linePatch(denops, 0, 2, "");
    await assertLine(denops, "あ😀😀");
  },
});
