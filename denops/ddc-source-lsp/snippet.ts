import { linePatch, parseSnippet } from "./deps/lsp.ts";
import { Params } from "../@ddc-sources/lsp.ts";

import type { Denops } from "jsr:@denops/std@~7.3.0";
import * as fn from "jsr:@denops/std@~7.3.0/function";
import * as op from "jsr:@denops/std@~7.3.0/option";

// Copyright (c) 2019 hrsh7th
// https://github.com/hrsh7th/vim-vsnip/blob/7753ba9c10429c29d25abfd11b4c60b76718c438/autoload/vsnip/indent.vim

async function getOneIndent(
  denops: Denops,
): Promise<string> {
  if (await op.expandtab.get(denops)) {
    let width = await op.shiftwidth.get(denops);
    if (width === 0) {
      width = await op.tabstop.get(denops);
    }
    return " ".repeat(width);
  } else {
    return "\t";
  }
}

async function getBaseIndent(
  denops: Denops,
): Promise<string> {
  const line = await fn.getline(denops, ".");
  return line.match(/^\s*/)?.[0] ?? "";
}

async function adjustIndent(
  denops: Denops,
  text: string,
): Promise<string> {
  const oneIndent = await getOneIndent(denops);
  const baseIndent = await getBaseIndent(denops);
  if (oneIndent !== "\t") {
    text = text.replaceAll(
      /(?<=^|\n)\t+/g,
      (match) => oneIndent.repeat(match.length),
    );
  }
  // Add baseIndent to all lines except the first line.
  text = text.replaceAll(/\n/g, `\n${baseIndent}`);
  // Remove indentation on all blank lines except the last line.
  text = text.replaceAll(/\n\s*\n/g, "\n\n");

  return text;
}

export async function expand(
  denops: Denops,
  body: string,
  snippetEngine: Params["snippetEngine"],
): Promise<void> {
  if (snippetEngine !== "") {
    // snippetEngine is registered
    if (typeof snippetEngine === "string") {
      await denops.call(
        "denops#callback#call",
        snippetEngine,
        body,
      );
    } else {
      await snippetEngine(body);
    }
  } else {
    const parsedText = parseSnippet(body);
    const adjustedText = await adjustIndent(denops, parsedText);
    await linePatch(denops, 0, 0, adjustedText);
  }
}
