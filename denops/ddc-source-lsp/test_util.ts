import { byteLength } from "./completion_item.ts";

import type { Denops } from "jsr:@denops/std@~7.4.0";
import * as nvim from "jsr:@denops/std@~7.4.0/function/nvim";

import { assertEquals } from "jsr:@std/assert@~1.0.0/equals";

// (1,0)-index, byte
export function searchCursor(
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

export async function assertBuffer(
  denops: Denops,
  buffer: string[],
): Promise<void> {
  const { row, col } = searchCursor(buffer, "");

  const actualBuffer = await nvim.nvim_buf_get_lines(denops, 0, 0, -1, true);
  assertEquals(actualBuffer, buffer);
  const actualCursor = await nvim.nvim_win_get_cursor(denops, 0);
  assertEquals(actualCursor, [row, col]);
}
