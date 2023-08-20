import { BaseFilter, Item } from "../ddc-source-nvim-lsp/deps.ts";
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
    const { kindLabels: labels, kindHlGroups: hlGroups } = args.filterParams;

    for (const item of args.items) {
      const kind = item.kind ?? "";

      item.kind = labels[kind] ?? item.kind;

      const hl_group = hlGroups[kind];
      if (!hl_group) {
        continue;
      }
      const hlName = `lsp-kind-label-${kind}`;
      if (item.highlights?.some((hl) => hl.name === hlName)) {
        continue;
      }
      item.highlights = [
        ...item.highlights ?? [],
        {
          name: hlName,
          type: "kind",
          hl_group,
          col: 1,
          width: byteLength(kind),
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
