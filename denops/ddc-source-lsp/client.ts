import { Denops, fn } from "./deps/denops.ts";
import { OffsetEncoding } from "./deps/lsp.ts";
import { LSP } from "./deps/lsp.ts";
import { Params } from "../@ddc-sources/lsp.ts";

export type Client = {
  id: number | string;
  provider: Exclude<LSP.ServerCapabilities["completionProvider"], undefined>;
  offsetEncoding: OffsetEncoding;
};

export async function getClients(
  denops: Denops,
  lspEngine: Params["lspEngine"],
  bufnr?: number,
): Promise<Client[]> {
  if (lspEngine === "nvim-lsp") {
    return await denops.call(
      "luaeval",
      `require("ddc_source_lsp.internal").get_clients(_A[1])`,
      [bufnr],
    ) as Client[];
  } else if (lspEngine === "vim-lsp") {
    const servers = await denops.call(
      "lsp#get_allowed_servers",
      bufnr ?? await fn.bufnr(denops),
    ) as string[];
    const clients: Client[] = [];
    for (const server of servers) {
      const serverCapabilities = await denops.call(
        "lsp#get_server_capabilities",
        server,
      ) as LSP.ServerCapabilities;
      if (serverCapabilities.completionProvider == null) {
        continue;
      }
      clients.push({
        id: server,
        provider: serverCapabilities.completionProvider,
        offsetEncoding: serverCapabilities.positionEncoding as OffsetEncoding ??
          "utf-16",
      });
    }
    return clients;
  } else if (lspEngine === "lspoints") {
    return (await denops.dispatch(
      "lspoints",
      "getClients",
      bufnr ?? await fn.bufnr(denops),
    ) as {
      id: number;
      serverCapabilities: LSP.ServerCapabilities;
    }[])
      .filter((c) => c.serverCapabilities.completionProvider != null)
      .map((c): Client => ({
        id: c.id,
        provider: c.serverCapabilities.completionProvider!,
        offsetEncoding:
          c.serverCapabilities.positionEncoding as OffsetEncoding ?? "utf-16",
      }));
  } else {
    lspEngine satisfies never;
    throw new Error(`Unknown lspEngine: ${lspEngine}`);
  }
}
