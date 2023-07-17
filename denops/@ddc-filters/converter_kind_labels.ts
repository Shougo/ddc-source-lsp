import { BaseFilter, Item } from "https://deno.land/x/ddc_vim@v3.9.0/types.ts";

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
    for (const item of args.items) {
      item.kind = item.kind && item.kind in labels
        ? labels[item.kind]
        : item.kind;
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
