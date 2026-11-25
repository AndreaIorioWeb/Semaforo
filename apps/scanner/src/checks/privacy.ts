import type { Element } from "domhandler";
import type { ScanContext } from "../scan/context.js";
import { legalText } from "../scan/context.js";
import { normalizeSpaces } from "../scan/html.js";
import { type Check, finding, snippet } from "./types.js";

export const PRIVACY_LINK = /privacy|informativa|riservatezza|dati personali|data protection|gdpr/i;

export const priv001: Check = {
  id: "PRIV-001",
  run(ctx) {
    const links = ctx.links.filter((l) => PRIVACY_LINK.test(`${l.text} ${l.href}`) && !/cookie/i.test(l.text));
    const anyPrivacy = links.length > 0 ? links : ctx.links.filter((l) => PRIVACY_LINK.test(`${l.text} ${l.href}`));
    if (anyPrivacy.length === 0) {
      return [
        finding("PRIV-001", {
          status: "ko",
          severity: "high",
          explanation:
            "Dalla home non abbiamo trovato un link all'informativa privacy. Chi visita il sito deve poterla raggiungere facilmente, di solito dal footer.",
          howToFix: "Pubblica un'informativa privacy e collegala dal footer di tutte le pagine con il testo \"Privacy policy\".",
        }),
      ];
    }
    const inFooter = anyPrivacy.some((l) => l.inFooter);
    return [
      finding("PRIV-001", {
        status: inFooter ? "ok" : "warn",
        severity: inFooter ? "info" : "low",
        explanation: inFooter
          ? "Il link all'informativa privacy è presente nel footer."
          : "Il link all'informativa privacy c'è, ma non nel footer: chi lo cerca di solito guarda in fondo alla pagina.",
        evidence: anyPrivacy.slice(0, 3).map((l) => l.url ?? l.href),
        howToFix: inFooter ? "Nessuna azione necessaria." : "Aggiungi il link anche nel footer di tutte le pagine.",
      }),
    ];
  },
};

/** Elementi minimi dell'art. 13 GDPR, cercati per parole chiave. */
export const ART13_ELEMENTS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "titolare del trattamento", re: /titolare\s+(del\s+)?trattamento|data controller/i },
  { label: "contatti del titolare", re: /@|e-?mail|pec|telefono|tel\./i },
  { label: "finalità", re: /finalit[àa]/i },
  { label: "base giuridica", re: /base\s+giuridic|basi\s+giuridic|art\.?\s*6|legittim[oi]\s+interess|consenso/i },
  { label: "destinatari", re: /destinatar|responsabil[ei]\s+(esterni\s+)?del\s+trattamento|comunica(ti|zione)\s+a/i },
  { label: "tempi di conservazione", re: /conserva(ti|zione|re)|periodo\s+di\s+conservazione|per\s+(un\s+periodo|il\s+tempo)/i },
  { label: "diritti dell'interessato", re: /diritt[oi]\s+(dell'interessato|di\s+accesso)|accesso,?\s+rettifica|art\.?\s*1[5-9]|art\.?\s*2[0-2]/i },
  { label: "reclamo al Garante", re: /reclamo|garante\s+(per\s+la\s+protezione|privacy)|autorit[àa]\s+di\s+controllo/i },
  { label: "trasferimenti extra UE", re: /extra[\s-]?(ue|europe)|paesi\s+terzi|fuori\s+dall'(unione|ue|spazio)|trasferiment/i },
];

export const priv002: Check = {
  id: "PRIV-002",
  run(ctx) {
    const text = legalText(ctx, "privacy");
    if (text === undefined) {
      return [
        finding("PRIV-002", {
          status: "unverifiable",
          severity: "info",
          explanation: "Non siamo riusciti a leggere il testo dell'informativa privacy, quindi non possiamo verificarne i contenuti minimi.",
          howToFix: "Verifica manualmente che l'informativa contenga tutti gli elementi dell'art. 13 GDPR.",
        }),
      ];
    }
    const missing = ART13_ELEMENTS.filter((e) => !e.re.test(text)).map((e) => e.label);
    if (missing.length === 0) {
      return [
        finding("PRIV-002", {
          status: "ok",
          severity: "info",
          explanation:
            "Nell'informativa compaiono tutti gli elementi minimi dell'art. 13 GDPR. È una verifica per parole chiave: non ne garantisce la correttezza.",
          howToFix: "Fai comunque rileggere periodicamente l'informativa da un professionista.",
        }),
      ];
    }
    return [
      finding("PRIV-002", {
        status: "warn",
        severity: missing.length >= 3 ? "high" : "medium",
        explanation: `Nell'informativa non abbiamo trovato riferimenti a: ${missing.join(", ")}. Potrebbero essere scritti con parole diverse, ma conviene controllare.`,
        evidence: missing.map((m) => `Elemento non trovato: ${m}`),
        howToFix: "Integra l'informativa con gli elementi mancanti previsti dall'art. 13 GDPR.",
      }),
    ];
  },
};

export const priv003: Check = {
  id: "PRIV-003",
  run(ctx) {
    const text = legalText(ctx, "privacy", "cookie");
    if (text === undefined) return [];
    const evidence: string[] = [];
    const dir9546 = /95\s*\/\s*46(\s*\/\s*CE)?/i.exec(text);
    if (dir9546) evidence.push(`Citata la Direttiva 95/46/CE, abrogata dal GDPR: "${snippet(around(text, dir9546.index), 100)}"`);
    const mentionsGdpr = /2016\s*\/\s*679|GDPR|regolamento\s+(generale\s+)?(ue|europeo)/i.test(text);
    const old13 = /art(icolo|\.)?\s*13\s+(del\s+)?(d\.?\s?lgs\.?|decreto\s+legislativo)\s*(n\.?\s*)?196\s*\/\s*(20)?03/i.exec(text);
    if (old13) evidence.push(`Citato l'art. 13 del D.Lgs. 196/2003, sostituito dall'art. 13 GDPR: "${snippet(around(text, old13.index), 100)}"`);
    if (!mentionsGdpr && /196\s*\/\s*(20)?03/.test(text)) {
      evidence.push("Citato il D.Lgs. 196/2003 senza alcun riferimento al GDPR (Reg. UE 2016/679)");
    }
    if (evidence.length === 0) {
      return [
        finding("PRIV-003", {
          status: "ok",
          severity: "info",
          explanation: "Non abbiamo trovato riferimenti a norme superate.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("PRIV-003", {
        status: !mentionsGdpr ? "ko" : "warn",
        severity: "medium",
        explanation: !mentionsGdpr
          ? "L'informativa si basa su norme superate e non cita il GDPR: probabilmente è un testo vecchio, precedente al 2018."
          : "L'informativa cita norme superate. Se sono citate come base del trattamento vanno sostituite con il GDPR.",
        evidence,
        howToFix: "Aggiorna l'informativa facendo riferimento al Reg. (UE) 2016/679 (GDPR) e al D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.",
      }),
    ];
  },
};

function around(text: string, index: number): string {
  return text.slice(Math.max(0, index - 30), index + 70);
}

interface FormInfo {
  label: string;
  hasPrivacyLink: boolean;
  checkboxes: Array<{ text: string; checked: boolean; required: boolean }>;
}

const CONSENT_WORDS = /privacy|consenso|acconsento|autorizzo|trattamento|newsletter|marketing|promozional|accetto|ho letto/i;
const MARKETING_WORDS = /newsletter|marketing|promozion|commercial|offerte|comunicazioni\s+(commerciali|promozionali)|iscriv/i;
const SERVICE_WORDS = /richiesta|privacy|informativa|trattamento\s+dei\s+(miei\s+)?dati|ho\s+letto/i;

/** Moduli che raccolgono dati personali (con campo email o telefono o textarea). */
function personalDataForms(ctx: ScanContext): FormInfo[] {
  const $ = ctx.$;
  const forms: FormInfo[] = [];
  $("form").each((i, form) => {
    const $form = $(form);
    const collects = $form.find('input[type=email], input[name*=mail i], input[type=tel], textarea').length > 0;
    if (!collects) return;
    // Cerco l'informativa nel modulo o nel suo contenitore diretto.
    const scope = $form.add($form.parent());
    const hasPrivacyLink = scope.find("a[href]").toArray().some((a) => PRIVACY_LINK.test(`${$(a).text()} ${$(a).attr("href")}`));
    const checkboxes = $form
      .find("input[type=checkbox]")
      .toArray()
      .map((cb) => ({
        text: checkboxText(ctx, cb),
        checked: $(cb).is("[checked]"),
        required: $(cb).is("[required]"),
      }));
    const name = $form.attr("id") ?? $form.attr("name") ?? $form.attr("class")?.split(/\s+/)[0] ?? `#${i + 1}`;
    forms.push({ label: `modulo ${name}`, hasPrivacyLink, checkboxes });
  });
  return forms;
}

function checkboxText(ctx: ScanContext, cb: Element): string {
  const $ = ctx.$;
  const $cb = $(cb);
  const id = $cb.attr("id");
  const byFor = id ? $(`label[for="${id.replace(/"/g, '\\"')}"]`).text() : "";
  const wrapping = $cb.closest("label").text();
  const sibling = $cb.parent().text();
  return normalizeSpaces(byFor || wrapping || sibling || ($cb.attr("name") ?? ""));
}

export const priv004: Check = {
  id: "PRIV-004",
  run(ctx) {
    const forms = personalDataForms(ctx);
    if (forms.length === 0) return [];
    const preChecked = forms.flatMap((f) =>
      f.checkboxes.filter((c) => c.checked && CONSENT_WORDS.test(c.text)).map((c) => `${f.label}: "${snippet(c.text, 80)}" già spuntata`),
    );
    const withoutLink = forms.filter((f) => !f.hasPrivacyLink).map((f) => `${f.label}: nessun link all'informativa vicino al modulo`);

    if (preChecked.length > 0) {
      return [
        finding("PRIV-004", {
          status: "ko",
          severity: "high",
          explanation:
            "Un modulo ha una casella di consenso già spuntata. Il consenso deve essere un gesto attivo di chi compila: una casella preselezionata non vale come consenso.",
          evidence: [...preChecked, ...withoutLink],
          howToFix: "Togli l'attributo \"checked\" dalle caselle di consenso e collega l'informativa privacy accanto al pulsante di invio.",
        }),
      ];
    }
    if (withoutLink.length > 0) {
      return [
        finding("PRIV-004", {
          status: "warn",
          severity: "medium",
          explanation: "Un modulo raccoglie dati personali ma non ha un link all'informativa privacy nelle vicinanze.",
          evidence: withoutLink,
          howToFix: "Aggiungi sotto il modulo una frase come \"Inviando accetti il trattamento dei dati secondo la Privacy policy\", con il link.",
        }),
      ];
    }
    return [
      finding("PRIV-004", {
        status: "ok",
        severity: "info",
        explanation: "I moduli hanno un link all'informativa e nessuna casella di consenso preselezionata.",
        howToFix: "Nessuna azione necessaria.",
      }),
    ];
  },
};

export const priv005: Check = {
  id: "PRIV-005",
  run(ctx) {
    const forms = personalDataForms(ctx);
    const relevant = forms.filter((f) => f.checkboxes.some((c) => MARKETING_WORDS.test(c.text)));
    if (relevant.length === 0) return [];
    const bundled = relevant.flatMap((f) =>
      f.checkboxes
        .filter((c) => MARKETING_WORDS.test(c.text) && SERVICE_WORDS.test(c.text))
        .map((c) => `${f.label}: "${snippet(c.text, 90)}"`),
    );
    const requiredMarketing = relevant.flatMap((f) =>
      f.checkboxes.filter((c) => MARKETING_WORDS.test(c.text) && c.required).map(() => `${f.label}: consenso marketing obbligatorio`),
    );
    if (bundled.length === 0 && requiredMarketing.length === 0) {
      return [
        finding("PRIV-005", {
          status: "ok",
          severity: "info",
          explanation: "Il consenso al marketing è una casella separata e facoltativa.",
          howToFix: "Nessuna azione necessaria.",
        }),
      ];
    }
    return [
      finding("PRIV-005", {
        status: "warn",
        severity: "medium",
        explanation:
          "Il consenso al marketing sembra unito al consenso per la richiesta, oppure è obbligatorio. Deve essere separato e facoltativo: chi scrive per un preventivo non deve essere costretto a ricevere promozioni.",
        evidence: [...bundled, ...requiredMarketing],
        howToFix: "Usa due caselle distinte: una (o un'informativa) per gestire la richiesta, una facoltativa e non preselezionata per newsletter o marketing.",
      }),
    ];
  },
};

export const PRIVACY_CHECKS: readonly Check[] = [priv001, priv002, priv003, priv004, priv005];
