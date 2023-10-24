import { LSP } from "./deps/lsp.ts";

/**
 * How a completion was triggered
 * @link https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionTriggerKind
 */
export enum CompletionTriggerKind {
  /**
   * Completion was triggered by typing an identifier (24x7 code
   * complete), manual invocation (e.g Ctrl+Space) or via API.
   */
  Invoked = 1,

  /**
   * Completion was triggered by a trigger character specified by
   * the `triggerCharacters` properties of the
   * `CompletionRegistrationOptions`.
   */
  TriggerCharacter = 2,

  /**
   * Completion was re-triggered as the current completion list is incomplete.
   */
  TriggerForIncompleteCompletions = 3,
}

/**
 * WorkDoneProgressOptions
 * @link https://microsoft.github.io/language-server-protocol/specifications/specification-current/#workDoneProgressOptions
 */
interface WorkDoneProgressOptions {
  workDoneProgress?: boolean;
}

/**
 * CompletionOptions
 * @link https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionOptions
 */
export interface CompletionOptions extends WorkDoneProgressOptions {
  /**
   * The additional characters, beyond the defaults provided by the client (typically
   * [a-zA-Z]), that should automatically trigger a completion request. For example
   * `.` in JavaScript represents the beginning of an object property or method and is
   * thus a good candidate for triggering a completion request.
   *
   * Most tools trigger a completion request automatically without explicitly
   * requesting it using a keyboard shortcut (e.g. Ctrl+Space). Typically they
   * do so when the user starts to type an identifier. For example if the user
   * types `c` in a JavaScript file code complete will automatically pop up
   * present `console` besides others as a completion item. Characters that
   * make up identifiers don't need to be listed here.
   */
  triggerCharacters?: string[];

  /**
   * The list of all possible characters that commit a completion. This field
   * can be used if clients don't support individual commit characters per
   * completion item. See client capability
   * `completion.completionItem.commitCharactersSupport`.
   *
   * If a server provides both `allCommitCharacters` and commit characters on
   * an individual completion item the ones on the completion item win.
   *
   * @since 3.2.0
   */
  allCommitCharacters?: string[];

  /**
   * The server provides support to resolve additional
   * information for a completion item.
   */
  resolveProvider?: boolean;

  /**
   * The server supports the following `CompletionItem` specific
   * capabilities.
   *
   * @since 3.17.0
   */
  completionItem?: {
    /**
     * The server has support for completion item label
     * details (see also `CompletionItemLabelDetails`) when receiving
     * a completion item in a resolve call.
     *
     * @since 3.17.0
     */
    labelDetailsSupport?: boolean;
  };
}

/**
 * CompletionOptions
 * @link https://microsoft.github.io/language-server-protocol/specifications/specification-current/#completionParams
 */
export interface CompletionParams extends TextDocumentPositionParams {
  /**
   * The completion context. This is only available if the client specifies
   * to send this using the client capability
   * `completion.contextSupport === true`
   */
  context?: CompletionContext;
}

interface TextDocumentPositionParams {
  /**
   * The text document.
   */
  textDocument: LSP.TextDocumentIdentifier;

  /**
   * The position inside the text document.
   */
  position: LSP.Position;
}

/**
 * Contains additional information about the context in which a completion
 * request is triggered.
 */
export interface CompletionContext {
  /**
   * How the completion was triggered.
   */
  triggerKind: CompletionTriggerKind;

  /**
   * The trigger character (a single character) that has trigger code
   * complete. Is undefined if
   * `triggerKind !== CompletionTriggerKind.TriggerCharacter`
   */
  triggerCharacter?: string;
}
