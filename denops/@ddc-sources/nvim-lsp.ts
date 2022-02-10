import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.17.0/types.ts#^";
import {
  GatherCandidatesArguments,
} from "https://deno.land/x/ddc_vim@v0.17.0/base/source.ts#^";
import {
  CompletionItem,
  InsertTextFormat,
} from "https://deno.land/x/vscode_languageserver_types@v0.1.0/mod.ts#^";

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

function getWord(
  item: CompletionItem,
  input: string,
  completePosition: number,
): string {
  const label = item.label.replace(/^\s+/, "");

  let word = label;

  if (item.textEdit) {
    const textEdit = item.textEdit;
    word = textEdit.newText;
    if ("range" in textEdit) {
      const start = textEdit.range.start;
      const end = textEdit.range.end;
      if (item.insertTextFormat == InsertTextFormat.Snippet) {
        word = getSnippetWord(word);
      }
      if (start.line == end.line && start.character == end.character) {
        word = `${input.slice(completePosition)}${word}`;
      } else if (
        start.character < completePosition &&
        input.slice(start.character, completePosition) ==
          word.slice(0, completePosition - start.character)
      ) {
        // remove overwraped text which comes before complete position
        word = word.slice(completePosition - start.character);
      }
    }
  } else if (item.insertText) {
    word = item.insertText;
    if (item.insertTextFormat == InsertTextFormat.Snippet) {
      word = getSnippetWord(word);
    }
  }
  return word;
}

function getSnippetWord(txt: string): string {
  // remove snippet's tabstop
  txt = txt.replace(/\$[0-9]+|\${(?:\\.|[^}])+}/g, "");
  txt = txt.replace(/\\(.)/g, "$1");
  const m = txt.match(
    /^((?:<.*>)|(?:\[.*\])|(?:\(.*\))|(?:{.*})|(?:".*")|(?:'.*'))/,
  );
  if (m) {
    return m[0];
  }
  const valid = txt.match(/^[^"'' (<{\[\t\r\n]+/);
  if (!valid) {
    return txt;
  }
  return valid[0];
}

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
      const item = {
        word: getWord(v, input, completePosition),
        abbr: v.label.trim(),
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
