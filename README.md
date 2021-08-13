# ddc-nvim-lsp

nvim-lsp completion for ddc.vim


## Required

### denops.vim

https://github.com/vim-denops/denops.vim

### ddc.vim

https://github.com/Shougo/ddc.vim

### neovim 0.5.0+


## Configuration

```vim
call ddc#custom#patch_global('sources', ['nvimlsp'])
call ddc#custom#patch_global('sourceOptions', {
      \ '_': {'matchers': ['matcher_head']},
      \ 'nvimlsp': {'mark': 'lsp', 'forceCompletionPattern': '(\\.|:|->)'},
      \ })

" Use icon
"call ddc#custom#patch_global('sourceParams', {
"      \ 'nvimlsp': {'useIcon': v:true},
"      \ })
```


## Params

- `useIcon`: Set to v:true to enable icons for
  LSP candidates. Requires patched font: https://www.nerdfonts.com/
  Default: `v:false`


## Original code

It based on [deoplete-lsp](https://github.com/deoplete-plugins/deoplete-lsp)
