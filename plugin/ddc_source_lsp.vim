if exists('g:loaded_ddc_source_lsp')
  finish
endif
let g:loaded_ddc_source_lsp = 1

function s:set_default_highlight() abort
  highlight default DdcLspDeprecated
        \ term=strikethrough cterm=strikethrough gui=strikethrough
endfunction

call s:set_default_highlight()

" Cleared default highlights without link when applying colorscheme
" so redefine it.
augroup ddc-source-lsp
  autocmd!
  autocmd ColorScheme * call <SID>set_default_highlight()
augroup END
