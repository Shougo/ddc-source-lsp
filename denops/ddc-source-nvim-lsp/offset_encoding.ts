const OffsetEncoding = [
  /**
   * Character offsets count UTF-8 code units (e.g bytes).
   */
  "utf-8",

  /**
   * Character offsets count UTF-16 code units.
   *
   * This is the default and must always be supported by servers
   */
  "utf-16",

  /**
   * Character offsets count UTF-32 code units.
   *
   * Implementation note: these are the same as Unicode code points,
   * so this `PositionEncodingKind` may also be used for an
   * encoding-agnostic representation of character offsets.
   */
  "utf-32",
] as const satisfies readonly string[];

export type OffsetEncoding = typeof OffsetEncoding[number];

export function decodeUtfIndex(
  line: string,
  utfIndex: number,
  offsetEncoding: OffsetEncoding = "utf-16",
): number {
  if (offsetEncoding === "utf-16") {
    return utfIndex;
  } else if (offsetEncoding === "utf-8") {
    return sliceByByteIndex(line, 0, utfIndex).length;
  } else if (offsetEncoding === "utf-32") {
    return [...line].slice(0, utfIndex).join().length;
  } else {
    offsetEncoding satisfies never;
    throw new Error(`Invalid offset encoding: ${offsetEncoding}`);
  }
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
function sliceByByteIndex(
  str: string,
  start?: number,
  end?: number,
) {
  const bytes = ENCODER.encode(str);
  const slicedBytes = bytes.slice(start, end);
  return DECODER.decode(slicedBytes);
}
