import { Denops, register } from "./deps/denops.ts";
import { deadline, DeadlineError, deferred } from "./deps/std.ts";
import { is, u } from "./deps/unknownutil.ts";
import { LSP } from "./deps/lsp.ts";
import { Params } from "../@ddc-sources/lsp.ts";
import { Client } from "./client.ts";

export async function request(
  denops: Denops,
  lspEngine: Params["lspEngine"],
  method: "textDocument/completion" | "completionItem/resolve",
  params: unknown,
  opts: { client: Client; timeout: number },
): Promise<unknown> {
  if (lspEngine === "nvim-lsp") {
    if (method === "textDocument/completion") {
      const defer = deferred();
      const id = register(denops, (response: unknown) => {
        defer.resolve(response);
      });
      await denops.call(
        `luaeval`,
        `require("ddc_source_lsp.internal").request(_A[1], _A[2], _A[3])`,
        [opts.client.id, params, { name: denops.name, id }],
      );
      return await deadline(defer, opts.timeout);
    } else {
      let lspItem = params;
      lspItem = await denops.call(
        "luaeval",
        `require("ddc_source_lsp.internal").resolve(_A[1], _A[2])`,
        [opts.client.id, lspItem],
      ) as LSP.CompletionItem | null ?? lspItem;
      return lspItem;
    }
  } else if (lspEngine === "vim-lsp") {
    const data = deferred<unknown>();
    const id = register(
      denops,
      (response: unknown) => data.resolve(response),
      { once: true },
    );
    try {
      await denops.eval(
        `lsp#send_request(l:server, extend(l:request,` +
          `{'on_notification': {data -> denops#notify(l:name, l:id, [data])}}))`,
        {
          server: opts.client.id,
          request: { method, params },
          name: denops.name,
          id,
        },
      );
      const resolvedData = await deadline(data, opts.timeout);
      const { response } = u.ensure(resolvedData, is.Record);
      const { result } = u.ensure(response, is.Record);
      return result;
    } catch (e) {
      if (e instanceof DeadlineError) {
        throw new Error(`No response from server ${opts.client.id}`);
      } else {
        throw new Error(`Unsupprted method: ${method}`);
      }
    }
  } else if (lspEngine === "lspoints") {
    return await denops.dispatch(
      "lspoints",
      "request",
      opts.client.id,
      method,
      params,
    );
  } else {
    lspEngine satisfies never;
    throw new Error(`unknown lspEngine: ${lspEngine}`);
  }
}
