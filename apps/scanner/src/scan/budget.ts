/** Contatore delle sottorichieste (SPEC sezione 5: max 50 sottorisorse, max 6 pagine legali). */
export class Budget {
  private used = 0;
  constructor(readonly max: number) {}

  take(): boolean {
    if (this.used >= this.max) return false;
    this.used++;
    return true;
  }

  get count(): number {
    return this.used;
  }
}

export const MAX_SUBRESOURCES = 50;
export const MAX_LEGAL_PAGES = 6;
export const MAX_SCRIPTS_FETCHED = 10;
export const MAX_SCRIPT_BYTES = 1024 * 1024;
