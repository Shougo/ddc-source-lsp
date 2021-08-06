import {
  BaseSource,
  Candidate,
  Context,
  DdcOptions,
  SourceOptions,
} from "https://deno.land/x/ddc_vim@v0.0.11/types.ts#^";
import {
  batch,
  Denops,
  vars,
} from "https://deno.land/x/ddc_vim@v0.0.11/deps.ts#^";

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
}

export class Source extends BaseSource {
  async onInit(
    denops: Denops,
  ): Promise<void> {
    await batch(denops, (helper) => {
      vars.g.set(helper, "ddc#source#lsp#_results", []);
      vars.g.set(helper, "ddc#source#lsp#_success", false);
      vars.g.set(helper, "ddc#source#lsp#_requested", false);
      vars.g.set(helper, "ddc#source#lsp#_prev_input", "");
      vars.g.set(helper, "ddc#source#lsp#_complete_position", -1);
    });
  }

  async gatherCandidates(
    denops: Denops,
    context: Context,
    _ddcOptions: DdcOptions,
    _sourceOptions: SourceOptions,
    _sourceParams: Record<string, unknown>,
    completeStr: string,
  ): Promise<Candidate[]> {
    const prevInput = await vars.g.get(denops, 'ddc#source#lsp#_prev_input');
    const requested = await vars.g.get(denops, 'ddc#source#lsp#_requested');
    if (context.input == prevInput && requested){
        return [];
    }

    const params = await denops.call(
        "luaeval",
        "vim.lsp.util.make_position_params()");

    await batch(denops, (helper) => {
      vars.g.set(helper, "ddc#source#lsp#_results", []);
      vars.g.set(helper, "ddc#source#lsp#_success", false);
      vars.g.set(helper, "ddc#source#lsp#_requested", false);
      vars.g.set(helper, "ddc#source#lsp#_prev_input", context.input);
      vars.g.set(helper, "ddc#source#lsp#_complete_position",
          charposToBytepos(
            context.input,
            context.input.length - completeStr.length
      ));

      helper.call(
          "luaeval", "require('ddc_nvim_lsp').request_candidates(" +
          "_A.arguments)",
          {'arguments': params})
    });

    return [];
  }
}
