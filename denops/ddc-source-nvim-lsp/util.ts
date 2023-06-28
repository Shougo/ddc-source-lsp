import { Denops } from "./deps.ts";

export async function printError(
  denops: Denops,
  message: Error | string,
) {
  await denops.call(
    `ddc#util#print_error`,
    message.toString(),
    "ddc-source-nvim-lsp",
  );
}
