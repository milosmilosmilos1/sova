import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { Button } from '@/components/ui/button'

export default async function NotFound() {
  const t = await getTranslations()
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">{t('errors.notFoundTitle')}</h1>
      <p className="max-w-md text-muted-foreground">{t('errors.notFoundText')}</p>
      <Button render={<Link href="/" />}>{t('common.backHome')}</Button>
    </main>
  )
}
