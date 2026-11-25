import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/test/fixtures/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "error",
      // I controlli sui caratteri di controllo negli URL sono voluti.
      "no-control-regex": "off",
    },
  },
  {
    // Gli script di misura stampano i risultati a terminale.
    files: ["**/scripts/**"],
    rules: { "no-console": "off" },
  },
);
