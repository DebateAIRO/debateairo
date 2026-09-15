const categories = ["HTTP_401","HTTP_404","JS_OR_HYDRATION","OTHER"];

export function emptyConsoleErrorCounts() {
  return Object.fromEntries(categories.map((category) => [category,0]));
}

export function classifyConsoleError(text) {
  if (/\b(?:401|unauthorized)\b/iu.test(text)) return "HTTP_401";
  if (/\b(?:404|not found)\b/iu.test(text)) return "HTTP_404";
  if (/\b(?:hydration|hydrate|uncaught|typeerror|referenceerror|syntaxerror)\b/iu.test(text)) {
    return "JS_OR_HYDRATION";
  }
  return "OTHER";
}
