import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/**
 * Ozbiljne i kritične prepreke pristupačnosti na trenutnoj strani (axe, WCAG 2.1 A i AA): bez imena
 * dugmeta, polje bez labele, kontrast. Manje ozbiljne se ne obaraju testom.
 */
export async function seriousViolations(page: Page, label: string): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${label} · ${v.id} (${v.impact}, ${v.nodes.length}×): ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    )
}
