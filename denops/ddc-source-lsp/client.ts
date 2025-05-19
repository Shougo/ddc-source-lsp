import { OffsetEncoding } from "./deps/lsp.ts";
import { LSP } from "./deps/lsp.ts";
import { Params } from "../@ddc-sources/lsp.ts";

import type { Denops } from "jsr:@denops/std@~7.5.0";
import * as fn from "jsr:@denops/std@~7.5.0/function";

export type Client = {
  id: number | string;
  name: string;
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
        name: server,
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
      name: string;
      serverCapabilities: LSP.ServerCapabilities;
    }[])
      .filter((c) => c.serverCapabilities.completionProvider != null)
      .map((c): Client => ({
        id: c.id,
        name: c.name,
        provider: c.serverCapabilities.completionProvider!,
        offsetEncoding:
          c.serverCapabilities.positionEncoding as OffsetEncoding ?? "utf-16",
      }));
  } else {
    lspEngine satisfies never;
    throw new Error(`Unknown lspEngine: ${lspEngine}`);
  }
}
