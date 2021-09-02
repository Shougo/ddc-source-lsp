# ddc-nvim-lsp

nvim-lsp completion for ddc.vim


## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddc.vim

https://github.com/Shougo/ddc.vim

### neovim 0.5.0+ with LSP configuration


## Configuration

```vim
call ddc#custom#patch_global('sources', ['nvimlsp'])
call ddc#custom#patch_global('sourceOptions', {
      \ '_': { 'matchers': ['matcher_head'] },
      \ 'nvimlsp': { 'mark': 'lsp', 'forceCompletionPattern': '\.|:|->' },
      \ })

" Use Customized labels
call ddc#custom#patch_global('sourceParams', {
      \ 'nvimlsp': { 'kindLabels': { 'Class': 'c' } },
      \ })
```


## Original code

It based on [deoplete-lsp](https://github.com/deoplete-plugins/deoplete-lsp)
