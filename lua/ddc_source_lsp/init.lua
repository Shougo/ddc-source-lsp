local M = {}

---@param override? table
---@return table client_capabilities
function M.make_client_capabilities(override)
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  capabilities.textDocument.completion = {
    dynamicRegistration = false,
    completionItem = {
      snippetSupport = true,
      commitCharactersSupport = true,
      deprecatedSupport = true,
      preselectSupport = true,
      tagSupport = {
        valueSet = {
          1, -- Deprecated
        },
      },
      insertReplaceSupport = true,
      resolveSupport = {
        properties = {
          "documentation",
          "detail",
          "additionalTextEdits",
          "insertText",
          "textEdit",
          "insertTextFormat",
          "insertTextMode",
        },
      },
      insertTextModeSupport = {
        valueSet = {
          1, -- asIs
          2, -- adjustIndentation
        },
      },
      labelDetailsSupport = true,
    },
    contextSupport = true,
    insertTextMode = 1,
    completionList = {
      itemDefaults = {
        "commitCharacters",
        "editRange",
        "insertTextFormat",
        "insertTextMode",
        "data",
      },
    },
  }
  capabilities = vim.tbl_deep_extend("force", capabilities, override or {})
  return capabilities
end

return M
