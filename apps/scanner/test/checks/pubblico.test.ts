import { describe, expect, it } from "vitest";
import { pub001, pub002, pub003, pub004, pub005, pub006, robotsBlocksAll, robotsSitemaps } from "../../src/checks/pubblico.js";
import { ctxFrom, fixture, page, runOne } from "../fixtures.js";

const clean = () => ctxFrom(fixture("static/clean-home.html"));
const wp = () => ctxFrom(fixture("static/wordpress-old.html"));

describe("robots.txt", () => {
  it("riconosce Disallow: / per tutti", () => {
    expect(robotsBlocksAll("User-agent: *\nDisallow: /")).toBe(true);
    expect(robotsBlocksAll("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php")).toBe(false);
    expect(robotsBlocksAll("User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow:")).toBe(false);
    expect(robotsSitemaps("Sitemap: https://a.it/sitemap.xml\nUser-agent: *")).toEqual(["https://a.it/sitemap.xml"]);
  });
});

describe("PUB-001 indicizzazione", () => {
  it("ko con meta noindex", () => expect(runOne(pub001, wp())?.status).toBe("ko"));
  it("ko con header X-Robots-Tag", () => {
    expect(runOne(pub001, ctxFrom(page(""), {}, { headers: { "x-robots-tag": "noindex" } }))?.status).toBe("ko");
  });
  it("ko con robots.txt Disallow: /", () => {
    expect(runOne(pub001, ctxFrom(page(""), { robotsTxt: "User-agent: *\nDisallow: /" }))?.status).toBe("ko");
  });
  it("ok se indicizzabile", () => expect(runOne(pub001, clean())?.status).toBe("ok"));
});

describe("PUB-002 titoli predefiniti", () => {
  it("ko con titolo WordPress predefinito", () => expect(runOne(pub002, wp())?.status).toBe("ko"));
  it.each(["Create Next App", "Vite + React + TS", "React App"])("ko per \"%s\"", (title) => {
    expect(runOne(pub002, ctxFrom(page("", `<title>${title}</title>`)))?.status).toBe("ko");
  });
  it("ok con titolo reale", () => expect(runOne(pub002, clean())?.status).toBe("ok"));
});

describe("PUB-003 segnaposto", () => {
  it("ko con lorem ipsum", () => expect(runOne(pub003, wp())?.status).toBe("ko"));
  it("warn con TODO (ambiguo)", () => expect(runOne(pub003, ctxFrom(page("<p>Orari: TODO</p>")))?.status).toBe("warn"));
  it("ok senza segnaposto", () => expect(runOne(pub003, clean())?.status).toBe("ok"));
});

describe("PUB-004 accessibilità di base", () => {
  it("ok sul sito corretto", () => expect(runOne(pub004, clean())?.status).toBe("ok"));
  it("warn, mai ko, con problemi", () => {
    const f = runOne(pub004, wp());
    expect(f?.status).toBe("warn");
    const ev = f?.evidence?.join(" | ") ?? "";
    expect(ev).toContain("lang");
    expect(ev).toContain("alt");
    expect(ev).toContain("2 titoli principali");
    expect(ev).toContain("etichetta");
    expect(ev).toContain("da h1 a h4");
  });
});

describe("PUB-005 meta tag e 404", () => {
  it("ok sul sito corretto", () => expect(runOne(pub005, ctxFrom(fixture("static/clean-home.html"), { notFoundStatus: 404 }))?.status).toBe("ok"));
  it("warn con meta mancanti e soft 404", () => {
    const f = runOne(pub005, ctxFrom(page("<h1>x</h1>"), { notFoundStatus: 200 }));
    expect(f).toMatchObject({ status: "warn", severity: "medium" });
    expect(f?.evidence?.join(" ")).toContain("risponde 200");
  });
});

describe("PUB-006 sitemap e robots", () => {
  it("ok se collegati", () => {
    expect(runOne(pub006, ctxFrom(page(""), { robotsTxt: "Sitemap: https://a.it/sitemap.xml", sitemapFound: true }))?.status).toBe("ok");
  });
  it("warn se mancano", () => {
    expect(runOne(pub006, ctxFrom(page(""), { robotsTxt: null, sitemapFound: false }))?.status).toBe("warn");
  });
  it("warn se robots.txt non cita la sitemap", () => {
    expect(runOne(pub006, ctxFrom(page(""), { robotsTxt: "User-agent: *\nDisallow:", sitemapFound: true }))?.status).toBe("warn");
  });
  it("nessun esito se non verificati", () => expect(pub006.run(clean())).toEqual([]));
});
