local api = vim.api

local get_candidates = function(id, _, arg1, arg2)
  -- For neovim 0.5.1/0.6 breaking changes
  -- https://github.com/neovim/neovim/pull/15504
  local result = ((vim.fn.has('nvim-0.6') == 1 or vim.fn.has('nvim-0.5.1'))
                  and type(arg1) == 'table' and arg1 or arg2)
  if not result or result == 0 then
    return
  end

  local success = (type(result) == 'table' and not vim.tbl_isempty(result)
    ) and true or false
  result = result['items'] ~= nil and result['items'] or result

  if #result > 0 then
    api.nvim_call_function('ddc#callback', {id, {
      result = result,
      success = success,
    }})
  end
end

local request_candidates = function(arguments, id)
  vim.lsp.buf_request(0, 'textDocument/completion', arguments, function(_, arg1, arg2) get_candidates(id, _, arg1, arg2) end)
end

return {
  request_candidates = request_candidates
}
