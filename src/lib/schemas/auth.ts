import { z } from 'zod'

export const emailSchema = z
  .email({ error: 'Unesite ispravnu email adresu.' })
  .max(254)
  .transform((v) => v.trim().toLowerCase())

export const passwordSchema = z
  .string({ error: 'Unesite lozinku.' })
  .min(10, { error: 'Lozinka mora imati najmanje 10 karaktera.' })
  .max(128, { error: 'Lozinka može imati najviše 128 karaktera.' })

/** Putanja za povratak posle prijave: samo relativna, bez protokola i bez `//`. */
export const nextPathSchema = z
  .string()
  .optional()
  .transform((v) => (v && /^\/(?!\/)[^\s]*$/.test(v) ? v : undefined))

export const registerSchema = z.object({
  fullName: z
    .string({ error: 'Unesite ime.' })
    .trim()
    .min(2, { error: 'Ime mora imati najmanje 2 karaktera.' })
    .max(100, { error: 'Ime može imati najviše 100 karaktera.' }),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal('on', { error: 'Morate prihvatiti Uslove korišćenja i Politiku privatnosti.' }),
  turnstileToken: z.string().optional(),
  next: nextPathSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Unesite lozinku.' }).min(1, { error: 'Unesite lozinku.' }),
  next: nextPathSchema,
})

export const magicLinkSchema = z.object({
  email: emailSchema,
  next: nextPathSchema,
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string({ error: 'Ponovite lozinku.' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: 'Lozinke se ne poklapaju.',
    path: ['confirmPassword'],
  })

export const resendVerificationSchema = z.object({
  email: emailSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
