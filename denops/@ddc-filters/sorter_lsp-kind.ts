import {
  BaseFilter,
  type FilterArguments,
} from "jsr:@shougo/ddc-vim@~9.5.0/filter";
import { type Item } from "jsr:@shougo/ddc-vim@~9.5.0/types";
import { CompletionItem } from "../ddc-source-lsp/completion_item.ts";

type LspKind = typeof CompletionItem.Kind[keyof typeof CompletionItem.Kind];

type Params = {
  priority: (LspKind | LspKind[])[];
};

export class Filter extends BaseFilter<Params> {
  filter({
    items,
    filterParams,
  }: FilterArguments<Params>): Promise<Item[]> {
    const priorityMap: Partial<Record<LspKind, number>> = {};
    filterParams.priority.forEach((kinds, i) => {
      if (Array.isArray(kinds)) {
        kinds.forEach((kind) => priorityMap[kind] = i);
      } else {
        priorityMap[kinds] = i;
      }
    });

    items.sort((a, b) =>
      (priorityMap[(a.kind ?? "") as LspKind] ?? 100) -
      (priorityMap[(b.kind ?? "") as LspKind] ?? 100)
    );
    return Promise.resolve(items);
  }

  params(): Params {
    const priority = Object.values(CompletionItem.Kind);
    // "Snippet" at the beginning
    priority.splice(priority.indexOf("Snippet"), 1);
    priority.unshift("Snippet");
    // "Text" at the end
    priority.splice(priority.indexOf("Text"), 1);
    priority.push("Text");
    return { priority };
  }
}
