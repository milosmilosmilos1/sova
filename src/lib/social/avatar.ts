/**
 * Slika naloga za prikaz (22.11.2026). Facebook za stranicu daje potpisanu adresu sa CDN-a koja
 * ističe posle nekoliko dana, pa se posle toga u aplikaciji vidi pokvarena slika. Za Facebook
 * stranicu zato se koristi stalna adresa Graph-a, koja je javna i uvek vodi na trenutnu sliku
 * (na *.fbcdn.net, dozvoljen u CSP-u). Ostale mreže zadržavaju sačuvanu adresu, koju osvežava
 * sinhronizacija; ako i ona istekne, prikaz pokazuje početna slova naloga.
 */
export function accountAvatarUrl(input: {
  platform: string | null | undefined
  externalId: string | null | undefined
  avatarUrl: string | null | undefined
}): string | null {
  if (input.platform === 'facebook' && input.externalId && /^\d+$/.test(input.externalId))
    return `https://graph.facebook.com/${input.externalId}/picture?type=normal`
  return input.avatarUrl ?? null
}
