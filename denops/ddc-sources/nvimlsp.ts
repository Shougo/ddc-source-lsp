import {
  BaseSource,
  Candidate,
  Context,
} from "https://deno.land/x/ddc_vim@v0.5.0/types.ts#^";
import {
  batch,
  Denops,
  vars,
} from "https://deno.land/x/ddc_vim@v0.5.0/deps.ts#^";

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

type Params = {
  kindLabels: Record<string, string>;
};

export class Source extends BaseSource {
  async onInit(args: {
    denops: Denops,
  }): Promise<void> {
    await batch(args.denops, async (denops: Denops) => {
      vars.g.set(denops, "ddc#source#lsp#_results", []);
      vars.g.set(denops, "ddc#source#lsp#_success", false);
      vars.g.set(denops, "ddc#source#lsp#_requested", false);
      vars.g.set(denops, "ddc#source#lsp#_prev_input", "");
      vars.g.set(denops, "ddc#source#lsp#_complete_position", -1);
    });
  }

  async gatherCandidates(args: {
    denops: Denops,
    context: Context,
    sourceParams: Record<string, Params>,
    completeStr: string,
  }): Promise<Candidate[]> {
    const prevInput = await vars.g.get(args.denops, "ddc#source#lsp#_prev_input");
    const requested = await vars.g.get(args.denops, "ddc#source#lsp#_requested");
    if (args.context.input == prevInput && requested) {
      return this.processCandidates(args.denops, args.sourceParams);
    }

    const params = await args.denops.call(
      "luaeval",
      "vim.lsp.util.make_position_params()",
    );

    await batch(args.denops, async (denops: Denops) => {
      vars.g.set(denops, "ddc#source#lsp#_results", []);
      vars.g.set(denops, "ddc#source#lsp#_success", false);
      vars.g.set(denops, "ddc#source#lsp#_requested", false);
      vars.g.set(denops, "ddc#source#lsp#_prev_input", args.context.input);
      vars.g.set(
        denops,
        "ddc#source#lsp#_complete_position",
        args.context.input.length - args.completeStr.length,
      );

      denops.call(
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
    params: Record<string, unknown>,
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

    const previousInput = await vars.g.get(
      denops,
      "ddc#source#lsp#_prev_input",
    ) as string;
    const completePosition = await vars.g.get(
      denops,
      "ddc#source#lsp#_complete_position",
    ) as number;

    const candidates = results.map((v) => {
      let word = "";

      if ("textEdit" in v && v["textEdit"]) {
        const textEdit = v["textEdit"] as any;
        if (
          textEdit && "range" in textEdit &&
          textEdit.range.start == textEdit.range.end
        ) {
          word = `${previousInput.slice(completePosition)}${textEdit.newText}`;
        } else {
          word = textEdit.newText;
        }
      } else if ("insertText" in v) {
        if ("insertText" in v && v.insertTextFormat != 1) {
          word = ("entryName" in v ? v.entryName : v.label) as string;
        } else {
          word = v.insertText as string;
        }
      } else {
        word = ("entryName" in v ? v.entryName : v.label) as string;
      }

      // Remove parentheses from word.
      // Note: some LSP includes snippet parentheses in word(newText)
      word = word.replace(/[\(|<].*[\)|>](\$\d+)?/, "");

      const item = {
        word: word,
        abbr: v.label as string,
        dup: false,
        "user_data": JSON.stringify({
          lspitem: v,
        }),
        kind: "",
        menu: "",
        info: "",
      };

      if (typeof v.kind === "number") {
        const labels = params.kindLabels as any;
        const kind = LSP_KINDS[v.kind - 1];
        item.kind = (kind in labels as any ? labels[kind] : kind) as string;
      } else if (v.insertTextFormat && v.insertTextFormat == 2) {
        item.kind = "Snippet";
      }

      if (v.detail) {
        item.menu = v.detail as string;
      }

      if (typeof v.documentation === "string") {
        item.info = v.documentation;
      } else if (
        v.documentation && typeof v.documentation === "object" &&
        "value" in v.documentation
      ) {
        item.info = (v.documentation as any).value;
      }

      return item;
    });

    return candidates;
  }

  params(): Record<string, unknown> {
    const params: Params = {
      kindLabels: {},
    };
    return params as unknown as Record<string, unknown>;
  }
}
