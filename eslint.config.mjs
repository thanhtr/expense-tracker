import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// jsx-a11y rules not covered by eslint-config-next
const a11yRules = {
  "jsx-a11y/anchor-ambiguous-text": "warn",
  "jsx-a11y/aria-activedescendant-has-tabindex": "error",
  "jsx-a11y/autocomplete-valid": "error",
  "jsx-a11y/click-events-have-key-events": "error",
  "jsx-a11y/control-has-associated-label": "off",
  "jsx-a11y/heading-has-content": "error",
  "jsx-a11y/html-has-lang": "error",
  "jsx-a11y/interactive-supports-focus": "error",
  "jsx-a11y/label-has-associated-control": "error",
  "jsx-a11y/mouse-events-have-key-events": "error",
  "jsx-a11y/no-access-key": "error",
  "jsx-a11y/no-noninteractive-element-interactions": "error",
  "jsx-a11y/no-noninteractive-element-to-interactive-role": ["error", {
    "ul": ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
    "ol": ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
    "li": ["menuitem", "menuitemradio", "menuitemcheckbox", "option", "row", "tab", "treeitem"],
    "table": ["grid"], "td": ["gridcell"], "fieldset": ["radiogroup", "presentation"],
  }],
  "jsx-a11y/no-noninteractive-tabindex": "error",
  "jsx-a11y/no-redundant-roles": "error",
  "jsx-a11y/no-static-element-interactions": "error",
  "jsx-a11y/scope": "error",
  "jsx-a11y/tabindex-no-positive": "error",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: a11yRules },
  // Allow _-prefixed variables as intentional "discard" slots in destructuring.
  { rules: { "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }] } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees — not part of the codebase
    ".claude/**",
  ]),
]);

export default eslintConfig;
