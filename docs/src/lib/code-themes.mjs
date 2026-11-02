const scopes = {
  comment: ["comment", "punctuation.definition.comment"],
  keyword: [
    "keyword",
    "storage",
    "storage.type",
    "storage.modifier",
    "keyword.control",
    "keyword.operator.new",
    "keyword.operator.expression",
    "keyword.operator.type",
    "constant.language",
    "variable.language",
    "punctuation.definition.template-expression",
  ],
  plain: [
    "keyword.operator",
    "punctuation",
    "meta.brace",
    "variable",
    "variable.other.constant",
    "variable.other.property",
    "support.variable.property",
    "meta.object-literal.key",
  ],
  string: ["string", "string.template", "punctuation.definition.string"],
  number: ["constant.numeric", "constant.character.escape"],
  fn: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "entity.name.function.macro"],
  type: [
    "entity.name.type",
    "entity.name.class",
    "entity.other.inherited-class",
    "support.type",
    "support.class",
    "support.type.primitive",
    "entity.name.type.interface",
  ],
};

function theme(name, type, c) {
  return {
    name,
    type,
    colors: { "editor.background": c.bg, "editor.foreground": c.plain },
    tokenColors: [
      { scope: scopes.comment, settings: { foreground: c.comment } },
      { scope: scopes.keyword, settings: { foreground: c.keyword, fontStyle: "bold" } },
      { scope: scopes.plain, settings: { foreground: c.plain } },
      { scope: scopes.string, settings: { foreground: c.string } },
      { scope: scopes.number, settings: { foreground: c.number } },
      { scope: scopes.fn, settings: { foreground: c.fn } },
      { scope: scopes.type, settings: { foreground: c.type } },
    ],
  };
}

export const xcodeDark = theme("gl36-xcode-dark", "dark", {
  bg: "#0d0d0e",
  plain: "#e5e5ea",
  comment: "#7f8c98",
  keyword: "#ff7ab2",
  string: "#ff8170",
  number: "#d9c97c",
  fn: "#67b7a4",
  type: "#5dd8ff",
});

export const xcodeLight = theme("gl36-xcode-light", "light", {
  bg: "#f5f5f7",
  plain: "#1d1d1f",
  comment: "#5d6c79",
  keyword: "#ad3da4",
  string: "#c41a16",
  number: "#272ad8",
  fn: "#326d74",
  type: "#0b4f79",
});
