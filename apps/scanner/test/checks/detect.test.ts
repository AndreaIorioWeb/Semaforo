import { describe, expect, it } from "vitest";
import { detectCms, detectTechnologies } from "../../src/detect/cms.js";
import { detectSiteType } from "../../src/detect/site-type.js";
import { ctxFrom, fixture, page } from "../fixtures.js";

describe("rilevamento CMS", () => {
  it("WordPress con versione", () => {
    expect(detectCms(ctxFrom(fixture("static/wordpress-old.html")))).toMatchObject({ name: "WordPress", version: "5.8.2" });
  });
  it.each([
    ["Shopify", '<script src="https://cdn.shopify.com/s/files/x.js"></script>'],
    ["Wix", '<meta name="generator" content="Wix.com Website Builder">'],
    ["Squarespace", '<link href="https://static1.squarespace.com/x.css">'],
    ["Webflow", '<html data-wf-page="123"><div data-wf-site="1"></div>'],
    ["Next.js", '<script src="/_next/static/chunks/main.js"></script>'],
    ["Joomla", '<meta name="generator" content="Joomla! - Open Source Content Management">'],
    ["PrestaShop", "<script>var prestashop = {};</script>"],
  ])("%s", (name, html) => {
    expect(detectCms(ctxFrom(page(html)))?.name).toBe(name);
  });
  it("nessun CMS su HTML semplice", () => expect(detectCms(ctxFrom(page("<p>ciao</p>")))).toBeUndefined());
  it("tecnologie: WooCommerce, jQuery, Elementor", () => {
    const tech = detectTechnologies(ctxFrom(fixture("static/wordpress-old.html")));
    expect(tech).toEqual(expect.arrayContaining(["jQuery", "Elementor"]));
    expect(detectTechnologies(ctxFrom(fixture("static/shop-home.html")))).toContain("WooCommerce");
  });
});

describe("rilevamento tipo sito", () => {
  it("shop con alta confidenza", () => {
    const ctx = ctxFrom(fixture("static/shop-home.html"));
    ctx.technologies = detectTechnologies(ctx);
    expect(detectSiteType(ctx)).toMatchObject({ siteType: "shop", confidence: "high" });
  });
  it("vetrina", () => {
    expect(detectSiteType(ctxFrom(fixture("static/clean-home.html")))).toMatchObject({ siteType: "showcase", confidence: "high" });
  });
  it("shop con bassa confidenza se ci sono solo prezzi (ambiguo)", () => {
    expect(detectSiteType(ctxFrom(page("<p>Listino: 49,00 € a persona. Il carrello dei bolliti.</p>")))).toMatchObject({ siteType: "shop", confidence: "low" });
  });
});
