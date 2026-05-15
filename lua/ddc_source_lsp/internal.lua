local M = {}

---@class Client
---@field id integer
---@field name string
---@field provider table
---@field offsetEncoding string

---@param bufnr integer?
---@return Client[]
function M.get_clients(bufnr)
  local clients = {}
  ---@diagnostic disable-next-line: deprecated
  local get_clients = vim.lsp.get_clients or vim.lsp.get_active_clients
  for _, client in pairs(get_clients({ bufnr = bufnr or 0 })) do
    local provider = (client.server_capabilities
                      and client.server_capabilities.completionProvider)
    if provider then
      table.insert(clients, {
        id = client.id,
        name = client.name,
        provider = provider,
        offsetEncoding = client.offset_encoding,
      })
    end
  end
  return clients
end

---Neovim may put true, etc. in key when converting from vim script.
---:h lua-special-tbl
---@param tbl table
---@return table
local function normalize(tbl)
  if type(tbl) ~= "table" then
    return tbl
  end

  local to_delete = {}
  for key, value in pairs(tbl) do
    local key_t = type(key)
    if key_t == "string" or key_t == "number" then
      if type(value) == "table" then
        tbl[key] = normalize(value)
      end
    else
      table.insert(to_delete, key)
    end
  end
  for _, k in ipairs(to_delete) do
    tbl[k] = nil
  end
  return tbl
end

---Doesn't block Nvim, but cannot be used in denops#request()
---@param clientId integer
---@param method vim.lsp.protocol.Method.ClientToServer.Request
---@param params table
---@param opts { plugin_name: string, lambda_id: string, bufnr: integer? }
---@return unknown?
function M.request(clientId, method, params, opts)
  opts = opts or {}
  local client = vim.lsp.get_client_by_id(clientId)
  if not client then
    return
  end
  client:request(method, normalize(params), function(err, result)
    if err == nil then
      pcall(function()
        vim.fn["denops#notify"](opts.plugin_name, opts.lambda_id, { result })
      end)
    else
      vim.notify(("ddc_source_lsp: request error: %s"):format(tostring(err)), vim.log.levels.DEBUG)
    end
  end, opts.bufnr or 0)
end

---Blocks Nvim, but can be used in denops#request()
---@param clientId integer
---@param method vim.lsp.protocol.Method.ClientToServer.Request
---@param params table
---@param opts { timeout: integer, bufnr: integer? }
---@return unknown?
function M.request_sync(clientId, method, params, opts)
  opts = opts or {}
  local client = vim.lsp.get_client_by_id(clientId)
  if not client then
    return
  end
  local resp = client:request_sync(
      method, normalize(params), opts.timeout, opts.bufnr or 0)
  if resp and resp.err == nil and resp.result then
    return resp.result
  end
end

---@param clientId integer
---@param command lsp.Command
function M.execute(clientId, command)
  local client = vim.lsp.get_client_by_id(clientId)
  if (client == nil or client.server_capabilities == nil
      or not client.server_capabilities.executeCommandProvider) then
    return
  end

  local params = {
    command = command and command.command or nil,
    arguments = command and command.arguments or nil,
  }

  client:request("workspace/executeCommand", params, nil, 0)
end

return M
