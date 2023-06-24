local M = {}

---@class Response
---@field result lsp.CompletionList | lsp.CompletionItem[]
---@field clientId number
---@field offset_encoding string
---@field resolve boolean

---@param params table
---@param trigger string
---@return Response[]
function M.request(params, trigger)
  local results = {}
  for _, client in pairs(vim.lsp.get_active_clients({ bufnr = 0 })) do
    local provider = client.server_capabilities.completionProvider
    if provider then
      if vim.list_contains(provider.triggerCharacters or {}, trigger) then
        params.context.triggerKind = 2
        params.context.triggerCharacter = trigger
      end

      local response = client.request_sync("textDocument/completion", params, 1000, 0)
      if response.err == nil and response.result then
        table.insert(results, {
          result = response.result,
          clientId = client.id,
          offsetEncoding = client.offset_encoding,
          resolvable = provider.resolveProvider == true,
        })
      end
    end
  end

  return results
end

---@param clientId number
---@param lspitem lsp.CompletionItem
---@return lsp.CompletionItem? lspitem
local function resolve(clientId, lspitem)
  local client = vim.lsp.get_client_by_id(clientId)
  -- https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionItem_resolve
  local response = client.request_sync("completionItem/resolve", lspitem, 1000, 0)
  if response.err == nil and response.result then
    return response.result
  end
end

---@param completed_item table
---@return table? completed_item
function M.resolve(completed_item)
  if completed_item.__sourceName ~= "nvim-lsp" or not completed_item.user_data.resolvable then
    return
  end
  local clientId = completed_item.user_data.clientId
  local lspitem = vim.json.decode(completed_item.user_data.lspitem)

  lspitem = resolve(clientId, lspitem) or lspitem

  completed_item.user_data.lspitem = vim.json.encode(lspitem)
  completed_item.user_data.resolvable = false

  return completed_item
end

function M.setup(opts)
  local group = vim.api.nvim_create_augroup("ddc-nvim-lsp", {})
  if opts.enableResolveItem then
    vim.api.nvim_create_autocmd("User", {
      pattern = "PumCompleteChanged",
      group = group,
      callback = function()
        local info = vim.fn["pum#complete_info"]()
        local current_item = info.items[info.selected + 1]
        if not current_item then
          return
        end
        local resolved_item = M.resolve(current_item)
        if resolved_item then
          vim.fn["pum#update_current_item"](resolved_item)
        end
      end,
    })
    vim.api.nvim_create_autocmd("User", {
      pattern = "PumCompleteDonePre",
      group = group,
      callback = function()
        local resolved_item = M.resolve(vim.v.completed_item)
        if resolved_item then
          vim.v.completed_item = resolved_item
        end
      end,
    })
  end
end

return M
