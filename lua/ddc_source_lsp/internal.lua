local M = {}

---@class Client
---@field id number
---@field provider table
---@field offsetEncoding string

---@param bufnr number?
---@return Client[]
function M.get_clients(bufnr)
  local clients = {}
  ---@diagnostic disable-next-line: deprecated
  local get_clients = vim.lsp.get_clients or vim.lsp.get_active_clients
  for _, client in pairs(get_clients({ bufnr = bufnr or 0 })) do
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

---Neovim may put true, etc. in key when converting from vim script.
---:h lua-special-tbl
---@param tbl table
---@return table
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
  return tbl
end

---Doesn't block Nvim, but cannot be used in denops#request()
---@param clientId number
---@param method string
---@param params table
---@param opts { plugin_name: string, lambda_id: string, bufnr: number? }
---@return unknown?
function M.request(clientId, method, params, opts)
  local client = vim.lsp.get_client_by_id(clientId)
  if client then
    client:request(method, normalize(params), function(err, result)
      if err == nil and result then
        vim.fn["denops#notify"](opts.plugin_name, opts.lambda_id, { result })
      end
    end, opts.bufnr or 0)
  end
end

---Blocks Nvim, but can be used in denops#request()
---@param clientId number
---@param method string
---@param params table
---@param opts { timeout: number, bufnr: number? }
---@return unknown?
function M.request_sync(clientId, method, params, opts)
  local client = vim.lsp.get_client_by_id(clientId)
  if client then
    local resp = client:request_sync(method, normalize(params), opts.timeout, opts.bufnr or 0)
    if resp and resp.err == nil and resp.result then
      return resp.result
    end
  end
end

---@param clientId number
---@param command lsp.Command
function M.execute(clientId, command)
  local client = vim.lsp.get_client_by_id(clientId)
  if client == nil or not client.server_capabilities.executeCommandProvider then
    return
  end
  command.title = nil
  client:request("workspace/executeCommand", command, nil, 0)
end

return M
