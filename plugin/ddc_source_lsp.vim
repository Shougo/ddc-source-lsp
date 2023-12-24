augroup ddc-source-lsp
  autocmd!
  " Cleared default highlights without link when applying colorscheme
  " so redefine it.
  autocmd ColorScheme * highlight default DdcLspDeprecated
        \ term=strikethrough cterm=strikethrough gui=strikethrough
augroup END
highlight default DdcLspDeprecated
      \ term=strikethrough cterm=strikethrough gui=strikethrough
