export default function createSelectText(
  insertText: string,
): string {
  let is_alnum_consumed = false;
  const pairs_stack: string[] = [];
  for (let i = 0; i < insertText.length; i++) {
    const char = insertText[i];
    const alnum = is_alnum(char);

    const pairChar = Pairs.get(char);
    if (!is_alnum_consumed && pairChar) {
      pairs_stack.push(pairChar);
    }
    if (is_alnum_consumed && !alnum && pairs_stack.length === 0) {
      if (StopCharacters.has(char)) {
        return insertText.slice(0, i);
      }
    } else {
      is_alnum_consumed = is_alnum_consumed || alnum;
    }

    if (char === pairs_stack[pairs_stack.length - 1]) {
      pairs_stack.pop();
    }
  }
  return insertText;
}

function is_alnum(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122); // a-z
}

const Pairs = new Map<string, string>([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ['"', '"'],
  ["'", "'"],
  ["<", ">"],
]);

const StopCharacters = new Set<string>([
  "'",
  '"',
  "=",
  "$",
  "(",
  ")",
  "[",
  "]",
  "<",
  ">",
  "{",
  "}",
  " ",
  "\t",
  "\n",
  "\r",
]);
