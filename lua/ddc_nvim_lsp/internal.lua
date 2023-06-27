local M = {}

---@class Client
---@field id number
---@field provider table
---@field offsetEncoding string

---@return Client[]
function M.get_clients()
  local clients = {}
  for _, client in pairs(vim.lsp.get_active_clients({ bufnr = 0 })) do
    local provider = client.server_capabilities.completionProvider
    if provider then
      table.insert(clients, {
        id = client.id,
        provider = provider,
        offsetEncoding = client.offset_encoding,
      })
    end
  end
  return clients
end

---@param clientId number
---@param params table
---@param denops { name: string, id: string }
function M.request(clientId, params, denops)
  local client = vim.lsp.get_client_by_id(clientId)
  if client == nil then
    return
  end
  client.request("textDocument/completion", params, function(err, result)
    if err == nil and result then
      vim.fn["denops#notify"](denops.name, denops.id, { result })
    end
  end, 0)
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
  completed_item.user_data.resolvable = false

  local clientId = completed_item.user_data.clientId
  local lspitem = vim.json.decode(completed_item.user_data.lspitem)
  lspitem = resolve(clientId, lspitem)
  if lspitem then
    completed_item.user_data.lspitem = vim.json.encode(lspitem)
    return completed_item
  end
end

function M.setup()
  local group = vim.api.nvim_create_augroup("ddc-nvim-lsp", {})
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

return M
