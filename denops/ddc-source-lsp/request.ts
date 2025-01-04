import { uriFromBufnr } from "./deps/lsp.ts";

import { Params } from "../@ddc-sources/lsp.ts";
import { Client } from "./client.ts";

import type { Denops } from "jsr:@denops/std@~7.4.0";
import * as fn from "jsr:@denops/std@~7.4.0/function";
import { register } from "jsr:@denops/std@~7.4.0/lambda";

import { deadline } from "jsr:@std/async@~1.0.0/deadline";
import { ensure } from "jsr:@core/unknownutil@~4.3.0/ensure";
import { is } from "jsr:@core/unknownutil@~4.3.0/is";

export async function request(
  denops: Denops,
  lspEngine: Params["lspEngine"],
  method: string,
  params: unknown,
  opts: { client: Client; timeout: number; sync: boolean; bufnr?: number },
): Promise<unknown> {
  if (lspEngine === "nvim-lsp") {
    if (opts.sync) {
      return await denops.call(
        `luaeval`,
        `require("ddc_source_lsp.internal").request_sync(_A[1], _A[2], _A[3], _A[4])`,
        [
          opts.client.id,
          method,
          params,
          { timemout: opts.timeout, bufnr: opts.bufnr },
        ],
      );
    } else {
      const waiter = Promise.withResolvers();
      const lambda_id = register(
        denops,
        (res: unknown) => waiter.resolve(res),
        { once: true },
      );
      await denops.call(
        `luaeval`,
        `require("ddc_source_lsp.internal").request(_A[1], _A[2], _A[3], _A[4])`,
        [opts.client.id, method, params, {
          plugin_name: denops.name,
          lambda_id,
          bufnr: opts.bufnr,
        }],
      );
      return deadline(waiter.promise, opts.timeout);
    }
  } else if (lspEngine === "vim-lsp") {
    const waiter = Promise.withResolvers();
    const id = register(
      denops,
      (res: unknown) => waiter.resolve(res),
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
          bufnr: opts.bufnr ?? await fn.bufnr(denops),
        },
      );
      const resolvedData = await deadline(waiter.promise, opts.timeout);
      const { response: { result } } = ensure(
        resolvedData,
        is.ObjectOf({ response: is.ObjectOf({ result: is.Any }) }),
      );
      return result;
    } catch (e) {
      if (e instanceof DOMException) {
        throw new Error(`No response from server ${opts.client.id}`);
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }
    }
  } else if (lspEngine === "lspoints") {
    if (opts.bufnr != null && opts.bufnr > 0 && is.Record(params)) {
      return await denops.dispatch(
        "lspoints",
        "request",
        opts.client.id,
        method,
        {
          ...params,
          textDocument: { uri: await uriFromBufnr(denops, opts.bufnr) },
        },
      );
    }
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
