import { BaseFilter, Item } from "https://deno.land/x/ddc_vim@v3.9.0/types.ts";
import { byteLength } from "../ddc-source-nvim-lsp/completion_item.ts";

type Params = {
  kindLabels: Record<string, string>;
  kindHlGroups: Record<string, string>;
};

export class Filter extends BaseFilter<Params> {
  override filter(args: {
    filterParams: Params;
    items: Item[];
  }): Promise<Item[]> {
    const labels = args.filterParams.kindLabels;
    const hlGrouns = args.filterParams.kindHlGroups;
    for (const item of args.items) {
      // extract hl_group here before item.kind is overwritten
      const hl_group = hlGrouns[item.kind ?? ""];
      item.kind = item.kind && item.kind in labels
        ? labels[item.kind]
        : item.kind;
      if (!hl_group) continue;
      const highlights = item.highlights ?? [];
      item.highlights = [
        ...highlights,
        {
          name: "lsp-kind-label",
          type: "kind",
          hl_group: hl_group,
          col: 1,
          width: byteLength(item.kind ?? ""),
        },
      ];
    }
    return Promise.resolve(args.items);
  }

  override params(): Params {
    return {
      kindLabels: {},
      kindHlGroups: {},
    };
  }
}
