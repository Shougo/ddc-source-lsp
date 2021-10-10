import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.16.0/types.ts#^";
import {
  GatherCandidatesArguments,
} from "https://deno.land/x/ddc_vim@v0.16.0/base/source.ts#^";
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
  private counter = 0;
  async gatherCandidates(
    args: GatherCandidatesArguments<Params>,
  ): Promise<Candidate[]> {
    this.counter = (this.counter + 1) % 100;

    const params = await args.denops.call(
      "luaeval",
      "vim.lsp.util.make_position_params()",
    );

    const id = `source/${this.name}/${this.counter}`;

    const [payload] = await Promise.all([
      args.onCallback(id) as Promise<{
        result: CompletionItem[];
        success: boolean;
      }>,
      args.denops.call(
        "luaeval",
        "require('ddc_nvim_lsp').request_candidates(" +
          "_A.arguments, _A.id)",
        { "arguments": params, id },
      ),
    ]);

    // payload.result may be not Array
    if (payload?.result?.length == null) {
      return [];
    }

    return this.processCandidates(
      args.sourceParams,
      payload.result,
      args.context.input,
      args.context.input.length - args.completeStr.length,
    );
  }

  private processCandidates(
    params: Params,
    results: CompletionItem[],
    input: string,
    completePosition: number,
  ): Candidate[] {
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
