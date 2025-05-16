# ddc-source-lsp

lsp completion for ddc.vim

## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddc.vim

https://github.com/Shougo/ddc.vim

### LSP client

Supported LSP clients are "nvim-lsp", "vim-lsp" and "lspoints"

https://github.com/prabirshrestha/vim-lsp

https://github.com/kuuote/lspoints

NOTE: If you use "nvim-lsp", it requires Neovim 0.11+.

## Configuration

To take advantage of all the features, you need to set client_capabilities.

```lua
vim.lsp.config('*', {
  capabilities = require("ddc_source_lsp").make_client_capabilities(),
})
```

```vim
call ddc#custom#patch_global('sources', ['lsp'])
call ddc#custom#patch_global('sourceOptions', #{
      \   lsp: #{
      \     mark: 'lsp',
      \     forceCompletionPattern: '\.\w*|:\w*|->\w*',
      \   },
      \ })

call ddc#custom#patch_global('sourceParams', #{
      \   lsp: #{
      \     snippetEngine: denops#callback#register({
      \           body -> vsnip#anonymous(body)
      \     }),
      \     enableResolveItem: v:true,
      \     enableAdditionalTextEdit: v:true,
      \   }
      \ })
```

## Original code

It based on [cmp-core-example](https://github.com/hrsh7th/cmp-core-example).
