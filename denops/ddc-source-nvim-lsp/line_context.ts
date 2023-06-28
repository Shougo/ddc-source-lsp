import { Denops, fn } from "./deps.ts";

export default class LineContext {
  // utf-16 offset
  character: number;
  text: string;

  constructor(
    character: number,
    text: string,
  ) {
    this.character = character;
    this.text = text;
  }

  static async create(
    denops: Denops,
  ) {
    const beforeLine = await denops.eval(
      `getline(".")[:getcurpos()[2]-2]`,
    ) as string;
    const character = beforeLine.length;
    const text = await fn.getline(denops, ".");
    return new LineContext(character, text);
  }
}
