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

const LSP_KINDS = [
  "Text",
  "Method",
  "Function",
  "Constructor",
  "Field",
  "Variable",
  "Class",
  "Interface",
  "Module",
  "Property",
  "Unit",
  "Value",
  "Enum",
  "Keyword",
  "Snippet",
  "Color",
  "File",
  "Reference",
  "Folder",
  "EnumMember",
  "Constant",
  "Struct",
  "Event",
  "Operator",
  "TypeParameter",
];

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
    const prevInput = await vars.g.get(denops, "ddc#source#lsp#_prev_input");
    const requested = await vars.g.get(denops, "ddc#source#lsp#_requested");
    if (context.input == prevInput && requested) {
      return this.processCandidates(denops);
    }

    const params = await denops.call(
      "luaeval",
      "vim.lsp.util.make_position_params()",
    );

    await batch(denops, (helper) => {
      vars.g.set(helper, "ddc#source#lsp#_results", []);
      vars.g.set(helper, "ddc#source#lsp#_success", false);
      vars.g.set(helper, "ddc#source#lsp#_requested", false);
      vars.g.set(helper, "ddc#source#lsp#_prev_input", context.input);
      vars.g.set(
        helper,
        "ddc#source#lsp#_complete_position",
        context.input.length - completeStr.length,
      );

      helper.call(
        "luaeval",
        "require('ddc_nvim_lsp').request_candidates(" +
          "_A.arguments)",
        { "arguments": params },
      );
    });

    return [];
  }

  async processCandidates(
    denops: Denops,
  ): Promise<Candidate[]> {
    const results = await vars.g.get(
      denops,
      "ddc#source#lsp#_results",
    ) as Record<
      string,
      unknown
    >[];

    if (results.length == 0) {
      return [];
    }

    const candidates = results.map((v) => {
      let word = "";

      if ("textEdit" in v && v["textEdit"]) {
        const textEdit = rec["textEdit"];
        if ("range" in textEdit && textEdit.range.start == textEdit.range.end) {
          const previousInput = vars.g.get(
            denops,
            "ddc#source#lsp#_prev_input",
          );
          const completePosition = vars.g.get(
            denops,
            "ddc#source#lsp#_complete_position",
          );
          word = `${previousInput.slice(completePosition)}${textEdit.newText}`;
        } else {
          word = textEdit.newText;
        }
      } else if ("insertText" in v) {
        if ("insertText" in v && v.insertTextFormat != 1) {
          word = "entryName" in v ? v.entryName : v.label;
        } else {
          word = rec.insertText;
        }
      } else {
        word = "entryName" in v ? v.entryName : v.label;
      }

      // Remove parentheses from word.
      // Note: some LSP includes snippet parentheses in word(newText)
      word = word.replace(/[\(|<].*[\)|>](\$\d+)?/, "");

      const item = {
        word: word,
        abbr: v.label,
        dup: 0,
        "user_data": JSON.stringify({
          lspitem: v,
        }),
      };

      if (typeof v.kind === "number") {
        item.kind = LSP_KINDS[v.kind - 1];
      } else if (v.insertTextFormat && v.insertTextFormat == 2) {
        item.kind = "Snippet";
      }

      if (v.detail) {
        item.menu = v.detail;
      }

      if (typeof v.documentation === "string") {
        item.info = v.documentation;
      } else if (v.documentation && "value" in v.documentation) {
        item.info = v.documentation.value;
      }

      return item;
    });

    return candidates;
  }
}
