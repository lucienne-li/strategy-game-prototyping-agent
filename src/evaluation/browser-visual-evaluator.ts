import { createHash } from "node:crypto";
import { chromium, type Page } from "playwright";

export type VisualTextExpectation = {
  selector: string;
  before: string;
  after: string;
};

export type BrowserVisualContract = {
  viewport: { width: number; height: number };
  requiredVisibleSelectors: readonly string[];
  interaction: {
    selector: string;
    expectations: readonly VisualTextExpectation[];
  };
};

export type BrowserVisualResult = {
  passed: boolean;
  rendered: boolean;
  nonBlank: boolean;
  controlsVisible: boolean;
  noObviousOverflow: boolean;
  interactionPassed: boolean;
  screenshotSha256?: string;
  error?: string;
};

/** Runs outside the generated-project workspace. Page JavaScript remains browser-sandboxed. */
export async function evaluateBrowserVisual(baseUrl: string, contract: BrowserVisualContract): Promise<BrowserVisualResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: contract.viewport });
    const response = await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 10_000 });
    const rendered = response?.ok() === true;
    const screenshot = await page.screenshot({ type: "png" });
    const screenshotSha256 = createHash("sha256").update(screenshot).digest("hex");
    const pageState = await inspectPage(page, contract);

    for (const expectation of contract.interaction.expectations) {
      const before = await page.locator(expectation.selector).textContent();
      if (before?.trim() !== expectation.before) {
        return failed(pageState, screenshotSha256, `before interaction: ${expectation.selector} expected ${JSON.stringify(expectation.before)}, got ${JSON.stringify(before?.trim())}`);
      }
    }

    await page.locator(contract.interaction.selector).click();
    let interactionPassed = true;
    for (const expectation of contract.interaction.expectations) {
      try {
        await page.locator(expectation.selector).filter({ hasText: expectation.after }).waitFor({ state: "visible", timeout: 2_000 });
        const after = await page.locator(expectation.selector).textContent();
        interactionPassed &&= after?.trim() === expectation.after;
      } catch {
        interactionPassed = false;
      }
    }

    const passed = rendered && pageState.nonBlank && pageState.controlsVisible && pageState.noObviousOverflow && interactionPassed;
    return {
      passed,
      rendered,
      ...pageState,
      interactionPassed,
      screenshotSha256,
      ...(passed ? {} : { error: "rendered page did not satisfy the frozen visual contract" })
    };
  } catch (error) {
    return {
      passed: false,
      rendered: false,
      nonBlank: false,
      controlsVisible: false,
      noObviousOverflow: false,
      interactionPassed: false,
      error: error instanceof Error ? error.message : "Playwright visual evaluation failed"
    };
  } finally {
    await browser.close();
  }
}

async function inspectPage(
  page: Page,
  contract: BrowserVisualContract
): Promise<Pick<BrowserVisualResult, "nonBlank" | "controlsVisible" | "noObviousOverflow">> {
  return page.evaluate(({ selectors, viewport }) => {
    const visible = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0
        && box.width > 0 && box.height > 0
        && box.left >= 0 && box.top >= 0 && box.right <= viewport.width && box.bottom <= viewport.height;
    };
    const required = selectors.map((selector) => document.querySelector(selector));
    const controlsVisible = required.every(visible);
    const bodyText = document.body?.innerText.trim() ?? "";
    const nonBlank = bodyText.length > 0 && required.some((element) => (element?.textContent?.trim().length ?? 0) > 0);
    const root = document.documentElement;
    const noObviousOverflow = root.scrollWidth <= viewport.width + 1 && required.every((element) => {
      if (!(element instanceof HTMLElement)) return false;
      const box = element.getBoundingClientRect();
      return box.right <= viewport.width && box.bottom <= viewport.height;
    });
    return { nonBlank, controlsVisible, noObviousOverflow };
  }, { selectors: [...contract.requiredVisibleSelectors], viewport: contract.viewport });
}

function failed(
  pageState: Pick<BrowserVisualResult, "nonBlank" | "controlsVisible" | "noObviousOverflow">,
  screenshotSha256: string,
  error: string
): BrowserVisualResult {
  return {
    passed: false,
    rendered: true,
    ...pageState,
    interactionPassed: false,
    screenshotSha256,
    error
  };
}
