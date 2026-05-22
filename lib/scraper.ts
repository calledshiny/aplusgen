// Amazon Product Scraper (Playwright)
// Extrahiert Titel, Beschreibung, Bullets, Specs, Hi-Res-Bilder, Marke und Kategorie
// aus einer amazon.{de,com,co.uk,…} Produktseite.
//
// Hinweis Vercel: Playwright läuft NICHT in Vercel-Serverless out-of-the-box.
// Für Deployment später: entweder Vercel-fn auf 1024MB + chromium-min, oder
// Apify/ScrapingBee als Fallback (siehe Spec).

import { chromium, type Browser, type Page } from "playwright";

export type ScrapedProduct = {
  title: string;
  description: string;
  bullets: string[];
  technicalDetails: Record<string, string>;
  images: string[];
  brand?: string;
  category?: string;
  url: string;
};

const AMAZON_HOST_RE = /^(?:www\.)?amazon\.(?:de|com|co\.uk|fr|it|es|nl|pl|se|com\.tr|ae|sa|com\.au|com\.mx|com\.br|ca|in|co\.jp)$/i;

export function isAmazonUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return AMAZON_HOST_RE.test(u.host);
  } catch {
    return false;
  }
}

// Hi-Res-Trick: aus Amazon-Bild-URL alle Größen-Tokens entfernen,
// damit das Original-Bild geladen wird.
function toHiRes(url: string): string {
  return url
    .replace(/\._[A-Z0-9_,]+_\./g, ".")
    .replace(/\._AC_[A-Z0-9_,]+_\./g, "._AC_.");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

const ASIN_RE = /^[A-Z0-9]{10}$/;

// Akzeptiert: vollständige Amazon-URL, oder reine ASIN (10 Zeichen alphanumerisch).
// Gibt kanonische amazon.de-URL zurück.
export function normalizeProductInput(input: string): string {
  const trimmed = input.trim();
  if (ASIN_RE.test(trimmed)) {
    return `https://www.amazon.de/dp/${trimmed}`;
  }
  return trimmed;
}

export async function scrapeAmazon(url: string): Promise<ScrapedProduct> {
  if (!isAmazonUrl(url)) {
    throw new Error(`Not an Amazon URL: ${url}`);
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
    });

    // Hide webdriver flag
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Cookie-Consent wegklicken falls vorhanden
    await dismissCookieBanner(page);

    // Wait for product title to ensure page actually rendered the product
    const titleVisible = await page
      .waitForSelector("#productTitle", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!titleVisible) {
      const debug = await page.evaluate(() => ({
        url: location.href,
        pageTitle: document.title,
        // Robot/captcha indicators
        hasCaptcha:
          !!document.querySelector("form[action*='/errors/']") ||
          !!document.querySelector("#captchacharacters") ||
          document.title.toLowerCase().includes("robot") ||
          document.body.textContent?.toLowerCase().includes("api-services-support@amazon"),
        bodyPreview: (document.body.textContent ?? "").trim().slice(0, 300),
      }));
      throw new Error(
        `Product title not found. URL=${debug.url} | title="${debug.pageTitle}" | captcha=${debug.hasCaptcha} | body="${debug.bodyPreview}"`,
      );
    }

    const scraped = await page.evaluate(() => {
      const $ = (sel: string) => document.querySelector(sel);
      const $$ = (sel: string) =>
        Array.from(document.querySelectorAll(sel));
      const text = (el: Element | null) =>
        (el?.textContent ?? "").trim().replace(/\s+/g, " ");

      // Title
      const title = text($("#productTitle"));

      // Bullets ("Über diesen Artikel")
      const bullets = $$(
        "#feature-bullets ul li:not(.aok-hidden) span.a-list-item",
      )
        .map((li) => text(li))
        .filter((s) => s.length > 0 && !/^Mehr Details ansehen$/i.test(s));

      // Beschreibung — bevorzugt aus "Produktbeschreibung des Herstellers" (A+ Region)
      // Fallback: #productDescription
      const aplusEl = $("#aplus") ?? $("#aplusBrandStory");
      const productDescEl = $("#productDescription");
      let description = "";
      if (aplusEl && (aplusEl.textContent ?? "").trim().length > 50) {
        description = text(aplusEl);
      } else if (productDescEl) {
        description = text(productDescEl);
      }

      // Technische Details — zwei mögliche Layouts
      const technicalDetails: Record<string, string> = {};
      // Tabellen-Layout (#productDetails_techSpec_section_1, _section_2)
      $$("table#productDetails_techSpec_section_1 tr, table#productDetails_techSpec_section_2 tr").forEach(
        (tr) => {
          const key = text(tr.querySelector("th"));
          const value = text(tr.querySelector("td"));
          if (key && value) technicalDetails[key] = value;
        },
      );
      // Bullet-Layout (#detailBullets_feature_div)
      $$("#detailBullets_feature_div li").forEach((li) => {
        const spans = li.querySelectorAll("span span");
        if (spans.length >= 2) {
          const key = text(spans[0])
            .replace(/[‏‎‎‏]/g, "")
            .replace(/\s*:\s*$/, "")
            .trim();
          const value = text(spans[1]).trim();
          if (key && value) technicalDetails[key] = value;
        }
      });

      // Bilder — autoritative Quelle ist die Thumbnail-Leiste (#altImages).
      // Jedes Thumbnail entspricht genau einem Produktbild; der große
      // "Display"-Bereich ist nur die hochaufgelöste Variante des aktuell
      // ausgewählten Thumbnails (mit ABWEICHENDER Amazon-Image-ID — würde
      // sonst als Duplikat reinrutschen). Falls keine Thumbnails existieren
      // (Single-Image-Produkt), Fallback auf das Hauptbild.
      const imageUrls = new Set<string>();

      const thumbs = Array.from(
        document.querySelectorAll(
          "#altImages li.item.imageThumbnail img, #altImages li.item img.a-button-thumbnail-image",
        ),
      )
        .map((img) => img.getAttribute("src"))
        .filter((s): s is string => !!s);

      if (thumbs.length > 0) {
        thumbs.forEach((src) => imageUrls.add(src));
      } else {
        // Single-Image-Produkt: aus data-a-dynamic-image die größte Variante ziehen
        const mainImg = document.querySelector(
          "#main-image-container img[data-a-dynamic-image], #imgTagWrapperId img[data-a-dynamic-image]",
        );
        if (mainImg) {
          const raw = mainImg.getAttribute("data-a-dynamic-image");
          if (raw) {
            try {
              const map = JSON.parse(raw) as Record<string, [number, number]>;
              let best: { url: string; area: number } | null = null;
              for (const [u, dims] of Object.entries(map)) {
                const area = (dims[0] ?? 0) * (dims[1] ?? 0);
                if (!best || area > best.area) best = { url: u, area };
              }
              if (best) imageUrls.add(best.url);
            } catch {
              /* ignore */
            }
          }
        }
        const landing = document.querySelector("#landingImage");
        const landingSrc = landing?.getAttribute("src");
        if (landingSrc) imageUrls.add(landingSrc);
      }

      // Marke
      const brandEl = $("#bylineInfo");
      let brand = text(brandEl);
      brand = brand
        .replace(/^Marke:\s*/i, "")
        .replace(/^Besuche den (.+?)-Store$/i, "$1")
        .replace(/^Besuchen Sie den (.+?)-Store$/i, "$1")
        .replace(/^Visit the (.+?) Store$/i, "$1")
        .trim();

      // Kategorie (letztes Breadcrumb-Element)
      const crumbs = $$("#wayfinding-breadcrumbs_container a").map((a) =>
        text(a),
      );
      const category = crumbs[crumbs.length - 1] ?? undefined;

      return {
        title,
        description,
        bullets,
        technicalDetails,
        images: Array.from(imageUrls),
        brand: brand || undefined,
        category,
      };
    });

    await browser.close();
    browser = null;

    return {
      ...scraped,
      images: uniq(scraped.images.map(toHiRes)),
      url,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// amazon.de / amazon.com Cookie-Banner wegklicken
async function dismissCookieBanner(page: Page): Promise<void> {
  const selectors = [
    "#sp-cc-accept", // amazon.de "Cookies akzeptieren"
    'input[name="accept"]',
    "button[data-cel-widget='sp-cc-accept']",
  ];
  for (const sel of selectors) {
    const btn = await page.$(sel);
    if (btn) {
      await btn.click().catch(() => {});
      // small settle delay
      await page.waitForTimeout(300);
      return;
    }
  }
}
