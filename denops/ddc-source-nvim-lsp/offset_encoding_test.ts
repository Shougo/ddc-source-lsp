import { decodeUtfIndex } from "./offset_encoding.ts";
import { assertEquals } from "./deps.ts";

Deno.test("utf-8", () => {
  assertEquals(decodeUtfIndex("🗿🗿🗿", 4, "utf-8"), 2);
});
Deno.test("utf-16", () => {
  assertEquals(decodeUtfIndex("🗿🗿🗿", 2, "utf-16"), 2);
});
Deno.test("utf-32", () => {
  assertEquals(decodeUtfIndex("🗿🗿🗿", 1, "utf-32"), 2);
});
