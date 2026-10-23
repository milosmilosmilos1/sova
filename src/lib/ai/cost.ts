import type { ModelPrice } from '@/lib/tokens/prices'

export interface Usage {
  inputTokens: number
  outputTokens: number
  thoughtTokens?: number
  images?: number
  imageSize?: '1K' | '2K' | '4K'
}

/** Procenjen trošak u USD po cenovniku provajdera; admin tako vidi stvarnu maržu. */
export function estimateCostUsd(price: ModelPrice | undefined, usage: Usage): number {
  if (!price) return 0
  const outputTokens = usage.outputTokens + (usage.thoughtTokens ?? 0)
  let cost =
    (usage.inputTokens / 1_000_000) * price.input_per_m + (outputTokens / 1_000_000) * price.output_per_m
  if (usage.images) {
    const perImage =
      usage.imageSize === '4K'
        ? (price.per_image_4k ?? price.per_image_2k ?? price.per_image_1k)
        : usage.imageSize === '2K'
          ? (price.per_image_2k ?? price.per_image_1k)
          : price.per_image_1k
    cost += usage.images * (perImage ?? 0)
  }
  return Math.round(cost * 1_000_000) / 1_000_000
}
