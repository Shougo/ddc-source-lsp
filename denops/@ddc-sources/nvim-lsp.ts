import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.13.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.13.0/base/source.ts#^";
import {
  batch,
  Denops,
  vars,
} from "https://deno.land/x/ddc_vim@v0.13.0/deps.ts#^";
import {
  CompletionItem,
  InsertTextFormat,
} from "https://deno.land/x/vscode_languageserver_types@v0.1.0/mod.ts#^";

import { equal } from "https://deno.land/x/equal@v1.5.0/mod.ts#^";

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

export class Source extends BaseSource<Params> {
  async gatherCandidates(
    args: GatherCandidatesArguments<Params>,
  ): Promise<Candidate[]> {
    const params = await args.denops.call(
      "luaeval",
      "vim.lsp.util.make_position_params()",
    );

    const id = `soruce/${this.name}`;
    await args.denops.call(
      "luaeval",
      "require('ddc_nvim_lsp').request_candidates(" +
        "_A.arguments, _A.id)",
      { "arguments": params, id },
    );

    const payload = await (args as any).onCallback(id, 2000);
    const result = payload.result as CompletionItem[];
    const success = payload.success as boolean;
    if (!success) return [];

    return this.processCandidates(
      args.sourceParams,
      result,
      args.context.input,
      args.context.input.length - args.completeStr.length,
    );
  }

  processCandidates(
    params: Params,
    results: CompletionItem[],
    input: string,
    completePosition: number,
  ): Candidate[] {
    if (results.length == 0) {
      return [];
    }

    const candidates = results.map((v) => {
      let word = "";

      // Remove heading spaces.
      const label = v.label.replace(/^\s+/, "");

      if (v.textEdit) {
        const textEdit = v.textEdit;
        if (
          "range" in textEdit && equal(textEdit.range.start, textEdit.range.end)
        ) {
          word = `${input.slice(completePosition)}${textEdit.newText}`;
        } else {
          word = textEdit.newText;
        }
      } else if (v.insertText) {
        if (v.insertTextFormat != InsertTextFormat.PlainText) {
          word = label;
        } else {
          word = v.insertText;
        }
      } else {
        word = label;
      }

      // Remove parentheses from word.
      // Note: some LSP includes snippet parentheses in word(newText)
      word = word.replace(/[\(|<].*[\)|>](\$\d+)?/, "");

      const item = {
        word: word,
        abbr: label,
        dup: false,
        "user_data": {
          lspitem: JSON.stringify(v),
        },
        kind: "",
        menu: "",
        info: "",
      };

      if (typeof v.kind === "number") {
        const labels = params.kindLabels;
        const kind = LSP_KINDS[v.kind - 1];
        item.kind = kind in labels ? labels[kind] : kind;
      } else if (
        v.insertTextFormat && v.insertTextFormat == InsertTextFormat.Snippet
      ) {
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

  params(): Params {
    return {
      kindLabels: {},
    };
  }
}
