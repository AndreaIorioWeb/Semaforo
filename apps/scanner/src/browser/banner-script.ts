/**
 * Script eseguito nella pagina per trovare il banner cookie SENZA interagire.
 * È una stringa (non una funzione TypeScript) per evitare che il compilatore vi inietti helper.
 * Restituisce un oggetto compatibile con BannerObservation.
 */
export const BANNER_SCRIPT = String.raw`(() => {
  const KNOWN = [
    ["OneTrust", "#onetrust-banner-sdk, #onetrust-consent-sdk"],
    ["Cookiebot", "#CybotCookiebotDialog"],
    ["iubenda", "#iubenda-cs-banner, .iubenda-cs-container"],
    ["Complianz", "#cmplz-cookiebanner-container .cmplz-cookiebanner, .cmplz-cookiebanner"],
    ["CookieYes", ".cky-consent-container, #cookie-law-info-bar"],
    ["Cookie Notice", "#cookie-notice"],
    ["Borlabs Cookie", "#BorlabsCookieBox"],
    ["Usercentrics", "#usercentrics-root, #uc-banner, #usercentrics-cmp-ui"],
    ["Didomi", "#didomi-notice, #didomi-host"],
    ["Quantcast", ".qc-cmp2-container"],
    ["TrustArc", "#truste-consent-track, #consent_blackbar"],
    ["Osano", ".osano-cm-dialog"],
    ["Klaro", ".klaro .cookie-notice, .klaro .cookie-modal"],
    ["CookieFirst", ".cookiefirst-root"],
    ["Real Cookie Banner", "#real-cookie-banner, [id^=bnr-]"],
    ["Cookie Script", "#cookiescript_injected"],
    ["Termly", "#termly-code-snippet-support"],
    ["Axeptio", "#axeptio_overlay"],
  ];
  const RE_REJECT = /rifiut|\bnega\b|non accett|solo (i |gli )?(cookie )?(necessar|tecnic|essenzial|indispensabil)|\breject|\bdecline|\bdeny|\brefuse|continua senza|necessary only|only necessary|essential only/i;
  const RE_ACCEPT = /accett|acconsent|consenti tutt|\baccept|\bagree|allow all|\bok\b|va bene|ho capito|got it|\bconsenti\b/i;
  const RE_CUSTOMIZE = /personalizz|preferenz|impostazion|gestisci|\bscegli|opzioni|customi[sz]|settings|\bmanage|more options|configura|dettagli/i;
  const RE_CLOSE = /^(×|✕|✖|x|chiudi|close|chiudi banner)$/i;

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
  }
  function textOf(el) {
    return ((el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || "") + "").replace(/\s+/g, " ").trim();
  }
  function all(root, selector) {
    const out = [];
    const walk = (r) => {
      try { r.querySelectorAll(selector).forEach((e) => out.push(e)); } catch (e) {}
      r.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
    };
    walk(root);
    return out;
  }
  function overlayLike(el) {
    let n = el;
    for (let i = 0; i < 8 && n && n.nodeType === 1; i++) {
      const s = getComputedStyle(n);
      if (s.position === "fixed" || s.position === "sticky") return true;
      const role = n.getAttribute && n.getAttribute("role");
      if (role === "dialog" || role === "alertdialog" || n.tagName === "DIALOG") return true;
      n = n.parentElement || (n.getRootNode && n.getRootNode().host);
    }
    return false;
  }

  let container = null, vendor = null, confidence = "low";
  for (const [name, sel] of KNOWN) {
    const found = all(document, sel).find(visible);
    if (found) { container = found; vendor = name; confidence = "high"; break; }
  }
  if (!container) {
    const candidates = all(document, "[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [id*=gdpr i], [class*=gdpr i], [aria-label*=cookie i], [role=dialog], [role=alertdialog], dialog, div, section, aside")
      .filter((el) => visible(el) && overlayLike(el))
      .filter((el) => { const t = textOf(el); return /cookie/i.test(t) && t.length < 4000; })
      .filter((el) => el.querySelector("button, a, [role=button], input[type=button], input[type=submit]"));
    candidates.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
    const best = candidates[0];
    if (best) {
      container = best;
      const idc = ((best.id || "") + " " + (typeof best.className === "string" ? best.className : "")).toLowerCase();
      confidence = /cookie|consent|gdpr/.test(idc) ? "high" : "low";
    }
  }
  if (!container) return { found: false, confidence: "low", text: "", buttons: [], hasCategoryToggles: false };

  const roots = [container];
  if (container.shadowRoot) roots.push(container.shadowRoot);
  const seen = new Set();
  const buttons = [];
  for (const root of roots) {
    for (const b of all(root, "button, a, [role=button], input[type=button], input[type=submit]")) {
      if (seen.has(b) || !visible(b)) continue;
      seen.add(b);
      const text = textOf(b).slice(0, 80);
      const label = (b.getAttribute("aria-label") || "").trim();
      let role = "other";
      if (RE_CLOSE.test(text) || /^(chiudi|close)/i.test(label)) role = "close";
      else if (RE_REJECT.test(text)) role = "reject";
      else if (RE_CUSTOMIZE.test(text)) role = "customize";
      else if (RE_ACCEPT.test(text)) role = "accept";
      const r = b.getBoundingClientRect();
      const s = getComputedStyle(b);
      const bg = s.backgroundColor;
      const transparent = bg === "transparent" || /rgba\(.+,\s*0\)$/.test(bg);
      const borderless = s.borderStyle === "none" || parseFloat(s.borderWidth) === 0;
      buttons.push({
        text, role,
        width: Math.round(r.width), height: Math.round(r.height),
        looksLikeLink: b.tagName === "A" && transparent && borderless,
        fontSize: parseFloat(s.fontSize) || 0,
        backgroundColor: bg, color: s.color,
      });
    }
  }
  const toggles = roots.flatMap((r) => all(r, "input[type=checkbox], [role=switch], [role=checkbox]")).filter((t) => visible(t) || visible(t.parentElement));
  return {
    found: true, confidence, vendor: vendor || undefined,
    text: textOf(container).slice(0, 600),
    buttons: buttons.slice(0, 15),
    hasCategoryToggles: toggles.length >= 2,
  };
})()`;
