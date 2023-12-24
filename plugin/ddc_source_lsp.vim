if exists('g:loaded_ddc_source_lsp')
  finish
endif
let g:loaded_ddc_source_lsp = 1

augroup ddc-source-lsp
  autocmd!
  " Cleared default highlights without link when applying colorscheme
  " so redefine it.
  autocmd ColorScheme * highlight default DdcLspDeprecated
        \ term=strikethrough cterm=strikethrough gui=strikethrough
augroup END
highlight default DdcLspDeprecated
      \ term=strikethrough cterm=strikethrough gui=strikethrough
