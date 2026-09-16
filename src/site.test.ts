import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderPublicPage } from "./entry-server.js";
import { PUBLIC_FAQ, SITE, SITE_SCHEMA } from "./site.js";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("public AEO/SEO contract", () => {
  it("uses the existing submitted HTTPS URL consistently", () => {
    const html = read("index.html");
    expect(SITE.url).toBe("https://nextcareer-five.vercel.app/");
    expect(html).toContain(`<link rel="canonical" href="${SITE.url}"`);
    expect(html).toContain(`<meta property="og:url" content="${SITE.url}"`);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<html lang="ko">');
  });

  it("keeps the title, descriptions and share image aligned", () => {
    const html = read("index.html");
    expect(html).toContain(`<title>${SITE.title}</title>`);
    expect(html).toContain(`property="og:title" content="${SITE.title}"`);
    expect(html).toContain(`property="og:description" content="${SITE.description}"`);
    expect(html).toContain(`property="og:image" content="${SITE.image}"`);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(readFileSync(resolve(process.cwd(), "public/og-image.png")).subarray(1, 4).toString()).toBe("PNG");
  });

  it("renders the same public content without running an interview", () => {
    const { markup } = renderPublicPage();
    expect(markup).toContain("Thank you for your service, sir.");
    expect(markup).toContain("복무해 주셔서 감사합니다.");
    expect(markup).toContain(SITE.description);
    for (const faq of PUBLIC_FAQ) {
      expect(markup).toContain(faq.question);
      expect(markup).toContain(faq.answer);
    }
    expect(markup).not.toContain("홍길동");
    expect(markup).not.toContain("GEMINI_API_KEY");
    expect(markup).not.toContain('aria-label="면담 대화"');
  });

  it("describes the actual app without invented ratings or claims", () => {
    const json = JSON.stringify(SITE_SCHEMA);
    expect(SITE_SCHEMA["@graph"].map((item) => item["@type"])).toEqual(["WebSite", "WebApplication"]);
    expect(json).toContain(SITE.description);
    for (const key of ["aggregateRating", "ratingValue", "review", "offers", "FAQPage"]) expect(json).not.toContain(`"${key}"`);
  });

  it("allows public crawling but separates API crawl/index controls", () => {
    const robots = read("public/robots.txt");
    expect(robots).toContain("User-agent: *\nAllow: /\nDisallow: /api/");
    expect(robots).toContain(`Sitemap: ${SITE.url}sitemap.xml`);
    expect(robots).not.toContain("Disallow: /assets");
    const config = JSON.parse(read("vercel.json"));
    const api = config.headers.find((rule: { source: string }) => rule.source === "/api/(.*)");
    expect(api.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });

  it("publishes only the canonical homepage in the sitemap", () => {
    const xml = read("public/sitemap.xml");
    expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])).toEqual([SITE.url]);
  });

  it("uses the prerender build and a consistent internal package name", () => {
    const pkg = JSON.parse(read("package.json"));
    const lock = JSON.parse(read("package-lock.json"));
    const vercel = JSON.parse(read("vercel.json"));
    expect(pkg.name).toBe("nextcareer");
    expect(lock.name).toBe(pkg.name);
    expect(lock.packages[""].name).toBe(pkg.name);
    expect(pkg.scripts.build).toBe("node scripts/build.mjs");
    expect(vercel.buildCommand).toBe("npm run build");
  });
});
