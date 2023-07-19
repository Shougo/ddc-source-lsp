local lsp = require("ddc_nvim_lsp.types")

local M = {
  opt = {
    debug = false,
  },
}

---@param opt table?
function M.setup(opt)
  M.opt = vim.tbl_extend("force", M.opt, opt or {})
end

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
    M.log(client.name, err)
    vim.fn["denops#notify"](denops.name, denops.id, { result })
  end, 0)
end

---Neovim may put true, etc. in key when converting from vim script.
---:h lua-special-tbl
---@param tbl table
local function normalize(tbl)
  for key, value in pairs(tbl) do
    local key_t = type(key)
    if key_t == "string" or key_t == "number" then
      if type(value) == "table" then
        normalize(value)
      end
    else
      tbl[key] = nil
    end
  end
end

---@param clientId number
---@param lspitem ddc.lsp.CompletionItem
---@return ddc.lsp.CompletionItem? lspitem
function M.resolve(clientId, lspitem)
  normalize(lspitem)
  local client = vim.lsp.get_client_by_id(clientId)
  local response = client.request_sync("completionItem/resolve", lspitem, 1000, 0)
  M.log(client.name, response.err)
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
    M.log(client.name, err)
  end, 0)
end

---@param client_name string
---@param err? ddc.lsp.ResponseError
function M.log(client_name, err)
  if err == nil or not M.opt.debug then
    return
  end

  vim.notify(
    ("%s: %s: %s"):format(client_name, lsp.ErrorCodes[err.code] or err.code, err.message),
    vim.log.levels.ERROR
  )
  vim.cmd.redraw()
end

return M
