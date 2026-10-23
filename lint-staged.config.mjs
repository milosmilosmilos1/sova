// lint-staged: fajlovi se dele u grupe da komandna linija na Windowsu ne pređe limit.
const CHUNK = 25

function chunk(files) {
  const out = []
  for (let i = 0; i < files.length; i += CHUNK) out.push(files.slice(i, i + CHUNK))
  return out
}

const quote = (f) => `"${f}"`

const config = {
  '*.{ts,tsx,mjs,js}': (files) => [
    ...chunk(files).map((group) => `eslint --fix --no-warn-ignored ${group.map(quote).join(' ')}`),
    ...chunk(files).map((group) => `prettier --write ${group.map(quote).join(' ')}`),
  ],
  '*.{json,md,css,yml,yaml}': (files) =>
    chunk(files).map((group) => `prettier --write ${group.map(quote).join(' ')}`),
}

export default config
