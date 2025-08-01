import { assertBuffer, searchCursor } from "./test_util.ts";
import { expand } from "./snippet.ts";

import type { Denops } from "jsr:@denops/std@~7.6.0";
import * as nvim from "jsr:@denops/std@~7.6.0/function/nvim";
import * as op from "jsr:@denops/std@~7.6.0/option";
import { test } from "jsr:@denops/test@~3.0.2";
import { batch } from "jsr:@denops/std@~7.6.0/batch";

type Suite = {
  expandtab: boolean;
  shiftwidth: number;
  tabstop: number;
  buffer: string[];
  body: string;
  expectBuffer: string[];
};

async function setup(
  denops: Denops,
  buffer: string[],
) {
  const { row, col } = searchCursor(buffer, "");
  await nvim.nvim_buf_set_lines(denops, 0, 0, -1, true, buffer);
  await nvim.nvim_win_set_cursor(denops, 0, [row, col]);
}

test({
  mode: "nvim",
  name: "snippet",
  fn: async (denops, t) => {
    const suites: Record<string, Suite> = {
      expandtab: {
        expandtab: false,
        shiftwidth: 8,
        tabstop: 4,
        buffer: ["\t|foo"],
        body: "bar\n\tbaz\n",
        expectBuffer: [
          "\tbar",
          "\t\tbaz",
          "\t|foo",
        ],
      },
      shiftwidth: {
        expandtab: true,
        shiftwidth: 8,
        tabstop: 4,
        buffer: ["    |foo"],
        body: "bar\n\tbaz\n",
        expectBuffer: [
          "    bar",
          "            baz",
          "    |foo",
        ],
      },
      tabstop: {
        expandtab: true,
        shiftwidth: 0,
        tabstop: 4,
        buffer: ["    |foo"],
        body: "bar\n\tbaz\n",
        expectBuffer: [
          "    bar",
          "        baz",
          "    |foo",
        ],
      },
      blankline: {
        expandtab: false,
        shiftwidth: 4,
        tabstop: 4,
        buffer: ["\t|foo"],
        body: "bar\n\n\tbaz\n",
        expectBuffer: [
          "\tbar",
          "",
          "\t\tbaz",
          "\t|foo",
        ],
      },
    };

    for (const [name, suite] of Object.entries(suites)) {
      await t.step({
        name,
        fn: async () => {
          await batch(denops, async (denops) => {
            await op.expandtab.set(denops, suite.expandtab);
            await op.shiftwidth.set(denops, suite.shiftwidth);
            await op.tabstop.set(denops, suite.tabstop);
          });
          await setup(denops, suite.buffer);
          await expand(denops, suite.body, "");
          await assertBuffer(denops, suite.expectBuffer);
        },
      });
    }
  },
});
