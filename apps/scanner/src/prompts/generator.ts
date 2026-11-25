// Il generatore vive nel pacchetto condiviso: lo usano scanner, web ("Copia tutti") e PDF.
export {
  buildCombinedPrompt,
  buildFixPrompt,
  FINAL_LINE,
  platformInstructions,
  type PromptContext,
  sortBySeverity,
  withFixPrompts,
} from "@semaforo/shared";
