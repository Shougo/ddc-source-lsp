local api = vim.api

local get_trigger_characters = function(client)
  local provider = client.server_capabilities.completionProvider
  if provider and provider.triggerCharacters then
    return provider.triggerCharacters
  end
  return nil
end

local request_candidates = function(arguments, id, trigger)
  local method = 'textDocument/completion'
  local method_supported = false
  for _, client in pairs(vim.lsp.buf_get_clients(0)) do
    local triggers = get_trigger_characters(client)
    if triggers and vim.tbl_contains(triggers, trigger) then
      -- CompletionTriggerKind.TriggerCharacter = 2
      arguments.context.triggerKind = 2
      arguments.context.triggerCharacter = trigger
    end
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

  local func = function(responses)
    local all = {}
    local is_incomplete = false;
    for _, r in pairs(responses)  do
      if r.result then
        local items = r.result.items or r.result
        for i = 1, #items do
          all[#all + 1] = items[i]
        end
        if r.result.isIncomplete then
          is_incomplete = true
        end
      end
    end
    api.nvim_call_function('ddc#callback', {id, {
      result = all,
      success = not vim.tbl_isempty(all),
      isIncomplete = is_incomplete,
    }})
  end
  local cancel = vim.lsp.buf_request_all(0, method, arguments, func)
  if not cancel then
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
