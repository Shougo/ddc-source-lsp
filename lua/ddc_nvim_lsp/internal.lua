local lsp = require("ddc_nvim_lsp.types")

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
---@param lspitem ddc.lsp.CompletionItem
---@return ddc.lsp.CompletionItem? lspitem
function M.resolve(clientId, lspitem)
  local client = vim.lsp.get_client_by_id(clientId)
  local response = client.request_sync("completionItem/resolve", lspitem, 1000, 0)
  if response.err == nil and response.result then
    return response.result
  end
end

---@param clientId number
---@param command ddc.lsp.Command
function M.execute(clientId, command)
  local client = vim.lsp.get_client_by_id(clientId)
  if client == nil then
    return
  end
  command.title = nil
  ---@param err ddc.lsp.ResponseError
  client.request("workspace/executeCommand", command, function(err)
    if err and err.code ~= lsp.ErrorCodes.ContentModified then
      vim.notify(
        ("%s: %s: %s"):format(
          client.name,
          lsp.ErrorCodes[err.code] or tostring(err.code),
          err.message
        ),
        vim.log.levels.ERROR
      )
      vim.cmd.redraw()
    end
  end, 0)
end

return M
