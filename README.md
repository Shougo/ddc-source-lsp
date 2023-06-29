# ddc-source-nvim-lsp

"nvim-lsp" completion for ddc.vim

## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddc.vim

https://github.com/Shougo/ddc.vim

### neovim with LSP configuration

## Configuration

To take advantage of all the features, you need to set client_capabilities.

```lua
local capabilities = require("ddc_nvim_lsp").make_client_capabilities()
require("lspconfig").denols.setup({
  capabilities = capabilities,
})
```

```vim
call ddc#custom#patch_global('sources', ['nvim-lsp'])
call ddc#custom#patch_global('sourceOptions', #{
      \   nvim-lsp: #{
      \     mark: 'lsp',
      \     forceCompletionPattern: '\.\w*|:\w*|->\w*',
      \   },
      \ })

call ddc#custom#patch_global('sourceParams', #{
      \   nvim-lsp: #{
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
