---@class ddc.lsp
local lsp = {}

---@see https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionList
---@class ddc.lsp.CompletionList
---@field isIncomplete boolean
---@field itemDefaults? ddc.lsp.itemDefaults
---@field items ddc.lsp.CompletionItem[]

---@class ddc.lsp.itemDefaults
---@field commitCharacters? string[]
---@field editRange? ddc.lsp.Range | { insert: ddc.lsp.Range, replace: ddc.lsp.Range }
---@field insertTextFormat? ddc.lsp.InsertTextFormat
---@field insertTextMode? ddc.lsp.InsertTextMode
---@field data? any

---@see https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionItem
---@class ddc.lsp.CompletionItem
---@field label string
---@field labelDetails? ddc.lsp.CompletionItemLabelDetails
---@field kind? ddc.lsp.CompletionItemKind
---@field tags? ddc.lsp.CompletionItemTag[]
---@field detail? string
---@field documentation? string | ddc.lsp.MarkupContent
---@field deprecated? boolean
---@field preselect? boolean
---@field sortText? string
---@field filterText? string
---@field insertText? string
---@field insertTextFormat? ddc.lsp.InsertTextFormat
---@field insertTextMode? ddc.lsp.InsertTextMode
---@field textEdit? ddc.lsp.TextEdit | ddc.lsp.InsertReplaceEdit
---@field textEditText? string
---@field additionalTextEdits? ddc.lsp.TextEdit[]
---@field commitCharacters? string[]
---@field command? ddc.lsp.Command
---@field data? any

---@class ddc.lsp.CompletionItemLabelDetails
---@field detail? string
---@field description? string

---@enum ddc.lsp.CompletionItemKind
lsp.CompletionItemKind = {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}
lsp.CompletionItemKind = vim.tbl_add_reverse_lookup(lsp.CompletionItemKind)

---@enum ddc.lsp.CompletionItemTag
lsp.CompletionItemTag = {
  Deprecated = 1,
}

---@class ddc.lsp.MarkupContent
---@field kind ddc.lsp.MarkupKind
---@field value string

---@enum ddc.lsp.MarkupKind
lsp.MarkupKind = {
  PlainText = "plaintext",
  Markdown = "markdown",
}

---@enum ddc.lsp.InsertTextFormat
lsp.InsertTextFormat = {
  PlainText = 1,
  Snippet = 2,
}

---@enum ddc.lsp.InsertTextMode
lsp.InsertTextMode = {
  asIs = 1,
  adjustIndentation = 2,
}

---@class ddc.lsp.TextEdit
---@field range ddc.lsp.Range
---@field newText string

---@class ddc.lsp.Range
---@field start ddc.lsp.Position
---@field end ddc.lsp.Position

---@class ddc.lsp.Position
---@field line number
---@field character number

---@class ddc.lsp.InsertReplaceEdit
---@field newText string
---@field insert ddc.lsp.Range
---@field replace ddc.lsp.Range

---@class ddc.lsp.Command
---@field title string
---@field command string
---@field arguments? any[]

return lsp
