import { byteOffsetToCharacter } from "./main.ts";

import { assertEquals } from "@std/assert/equals";

const ENCODER = new TextEncoder();
function byteLength(s: string): number {
  return ENCODER.encode(s).length;
}

Deno.test("byteOffsetToCharacter - ASCII only, utf-16", () => {
  const line = "abc";
  assertEquals(byteOffsetToCharacter(line, 0, "utf-16"), 0);
  assertEquals(byteOffsetToCharacter(line, 1, "utf-16"), 1);
  assertEquals(byteOffsetToCharacter(line, 3, "utf-16"), 3);
});

Deno.test("byteOffsetToCharacter - multibyte (Japanese), utf-16", () => {
  // "日本語[[It": each kanji is 3 UTF-8 bytes but 1 UTF-16 code unit.
  // At end of string (byteOffset = 13), the UTF-16 character count should be 7,
  // not 13 (the raw byte count that the buggy makePositionParams was sending).
  const line = "日本語[[It";
  const end = byteLength(line); // 13
  assertEquals(byteOffsetToCharacter(line, 0, "utf-16"), 0);
  assertEquals(byteOffsetToCharacter(line, byteLength("日"), "utf-16"), 1);
  assertEquals(byteOffsetToCharacter(line, byteLength("日本語"), "utf-16"), 3);
  assertEquals(byteOffsetToCharacter(line, end, "utf-16"), 7);
});

Deno.test("byteOffsetToCharacter - multibyte (Japanese), utf-8", () => {
  const line = "日本語[[It";
  const end = byteLength(line); // 13
  // For utf-8 encoding, the byte offset is returned unchanged.
  assertEquals(byteOffsetToCharacter(line, end, "utf-8"), end);
});

Deno.test("byteOffsetToCharacter - surrogate pairs, utf-16", () => {
  // 😀 (U+1F600) is 4 UTF-8 bytes and 2 UTF-16 code units (surrogate pair).
  const line = "😀!";
  assertEquals(byteOffsetToCharacter(line, 0, "utf-16"), 0);
  assertEquals(byteOffsetToCharacter(line, 4, "utf-16"), 2); // after 😀 = 2 code units
  assertEquals(byteOffsetToCharacter(line, 5, "utf-16"), 3); // after 😀!
});

Deno.test("byteOffsetToCharacter - surrogate pairs, utf-32", () => {
  // 😀 (U+1F600) is 1 Unicode code point, so utf-32 character = 1 after emoji.
  const line = "😀!";
  assertEquals(byteOffsetToCharacter(line, 4, "utf-32"), 1); // after 😀 = 1 code point
  assertEquals(byteOffsetToCharacter(line, 5, "utf-32"), 2); // after 😀!
});
