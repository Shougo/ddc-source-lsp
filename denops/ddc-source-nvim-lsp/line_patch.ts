import { Denops, fn, LSP } from "./deps.ts";
import LineContext from "./line_context.ts";

export default async function linePatch(
  denops: Denops,
  before: number,
  after: number,
  text: string,
): Promise<void> {
  const ctx = await LineContext.create(denops);
  const line = await fn.line(denops, ".") - 1;
  const textEdit = {
    range: {
      start: { line, character: ctx.character - before },
      end: { line, character: ctx.character + after },
    },
    newText: text,
  } satisfies LSP.TextEdit;

  await denops.call(
    "luaeval",
    "vim.lsp.util.apply_text_edits(_A, 0, 'utf-16')",
    [textEdit],
  );

  const insert_lines = text.split("\n");
  if (insert_lines.length === 1) {
    await setCursor(denops, {
      line,
      character: textEdit.range.start.character + insert_lines[0].length,
    });
  } else {
    await setCursor(denops, {
      line: line + insert_lines.length - 1,
      character: insert_lines[insert_lines.length - 1].length,
    });
  }
}

export async function setCursor(
  denops: Denops,
  position: LSP.Position,
): Promise<void> {
  const lnum = position.line + 1;
  const line = await fn.getline(denops, lnum);
  const col = byteLength(line.slice(0, position.character)) + 1;
  await fn.cursor(
    denops,
    position.line + 1,
    col,
  );
}

const ENCODER = new TextEncoder();
export function byteLength(
  str: string,
) {
  return ENCODER.encode(str).length;
}
