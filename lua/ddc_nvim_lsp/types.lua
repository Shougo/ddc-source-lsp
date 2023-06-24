---@see https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionList
---@class lsp.CompletionList
---@field isIncomplete boolean
---@field itemDefaults? lsp.itemDefaults
---@field items lsp.CompletionItem[]

---@class lsp.itemDefaults
---@field commitCharacters? string[]
---@field editRange? lsp.Range | { insert: lsp.Range, replace: lsp.Range }
---@field insertTextFormat? lsp.InsertTextFormat
---@field insertTextMode? lsp.InsertTextMode
---@field data? any

---@see https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionItem
---@class lsp.CompletionItem
---@field label string
---@field labelDetails? lsp.CompletionItemLabelDetails
---@field kind? lsp.CompletionItemKind
---@field tags? lsp.CompletionItemTag[]
---@field detail? string
---@field documentation? string | lsp.MarkupContent
---@field deprecated? boolean
---@field preselect? boolean
---@field sortText? string
---@field filterText? string
---@field insertText? string
---@field insertTextFormat? lsp.InsertTextFormat
---@field insertTextMode? lsp.InsertTextMode
---@field textEdit? lsp.TextEdit | lsp.InsertReplaceEdit
---@field textEditText? string
---@field additionalTextEdits? lsp.TextEdit[]
---@field commitCharacters? string[]
---@field command? lsp.Command
---@field data? any

---@class lsp.CompletionItemLabelDetails
---@field detail? string
---@field description? string

---@enum lsp.CompletionItemKind
local _ = {
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

---@enum lsp.CompletionItemTag
local _ = {
  Deprecated = 1,
}

---@class lsp.MarkupContent
---@field kind lsp.MarkupKind
---@field value string

---@enum lsp.MarkupKind
local _ = {
  PlainText = "plaintext",
  Markdown = "markdown",
}

---@enum lsp.InsertTextFormat
local _ = {
  PlainText = 1,
  Snippet = 2,
}

---@enum lsp.InsertTextMode
local _ = {
  asIs = 1,
  adjustIndentation = 2,
}

---@class lsp.TextEdit
---@field range lsp.Range
---@field newText string

---@class lsp.Range
---@field start lsp.Position
---@field end lsp.Position

---@class lsp.Position
---@field line number
---@field character number

---@class lsp.InsertReplaceEdit
---@field newText string
---@field insert lsp.Range
---@field replace lsp.Range

---@class lsp.Command
---@field title string
---@field command string
---@field arguments any[]
