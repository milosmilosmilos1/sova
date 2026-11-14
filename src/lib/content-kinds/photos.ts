import { getStyle, styleForPhotos, type StyleId } from '@/lib/visuals/design'
import type { PhotoSource } from '@/lib/visuals/design/catalog'

import type { KindTarget } from './index'

export interface KindPhotoPlan {
  /** 'none': bez dopune sa Unsplash-a, Pexels-a i iz galerije */
  photoSource: PhotoSource
  styleId: StyleId
  /** tačno ove fotografije, redom; ne ponavljaju se na ostalim slajdovima */
  photoAssetIds: string[]
}

/**
 * Fotografije po vrsti sadržaja (D-165): utisak bez fotografija sa strane (samo one koje je korisnik
 * sam priložio), osoba iz tima samo sa svojom, pre i posle sa svoje dve. Unsplash i Pexels nikad:
 * tuđa osoba ili tuđi rad bi se predstavili kao tim ili rezultat brenda. Kao kod priloženih
 * fotografija u Studiju (D-116), tipografski stil prelazi na „Poster”; pre i posle traži stil sa
 * fotografijom na svakom slajdu. Figma šablon brenda ostaje kakav jeste. Pitanje i humor: null.
 */
export function kindPhotoPlan(
  target: KindTarget,
  styleId: StyleId,
  opts: { template?: boolean; ownPhotos?: readonly string[] } = {},
): KindPhotoPlan | null {
  const withPhotos = (ids: string[]): KindPhotoPlan => ({
    photoSource: 'none',
    styleId: ids.length && !opts.template ? styleForPhotos(styleId, true) : styleId,
    photoAssetIds: ids,
  })
  switch (target.kind) {
    case 'review':
      return withPhotos([...(opts.ownPhotos ?? [])])
    case 'team':
      return withPhotos(target.item.photoAssetId ? [target.item.photoAssetId] : [])
    case 'before_after':
      return {
        photoSource: 'none',
        styleId: opts.template || getStyle(styleId).photo === 'all' ? styleId : 'poster',
        photoAssetIds: [target.item.beforeAssetId, target.item.afterAssetId],
      }
    default:
      return null
  }
}
