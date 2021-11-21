local api = vim.api

local get_candidates = function(id, _, arg1, arg2)
  -- For neovim 0.5.1/0.6 breaking changes
  -- https://github.com/neovim/neovim/pull/15504
  local result = ((vim.fn.has('nvim-0.6') == 1 or vim.fn.has('nvim-0.5.1'))
                  and type(arg1) == 'table' and arg1 or arg2)
  if not result or result == 0 then
    api.nvim_call_function('ddc#callback', {id, {
      result = {},
      success = false,
    }})
    return
  end

  local success = (type(result) == 'table' and not vim.tbl_isempty(result)
    ) and true or false
  result = result['items'] ~= nil and result['items'] or result

  api.nvim_call_function('ddc#callback', {id, {
    result = result,
    success = success,
  }})
end

local request_candidates = function(arguments, id)
  local method = 'textDocument/completion'
  local method_supported = false
  for _, client in pairs(vim.lsp.buf_get_clients(bufnr)) do
    if client.supports_method(method) then
      method_supported = true
    end
  end

  -- Note: if method is not supported, lsp.buf_request prints errors
  if not method_supported then
    api.nvim_call_function('ddc#callback', {id, {
      result = {},
      success = false,
    }})
    return
  end

  local func = function(_, arg1, arg2) get_candidates(id, _, arg1, arg2) end
  local map = vim.lsp.buf_request(0, method, arguments, func)
  if not map or vim.tbl_isempty(map) then
    api.nvim_call_function('ddc#callback', {id, {
      result = {},
      success = false,
    }})
    return
  end
end

return {
  request_candidates = request_candidates
}
