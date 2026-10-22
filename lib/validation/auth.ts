import { z } from "zod";

// Šeme za auth i nalog. Poruke su na srpskom jer idu direktno korisniku.

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Unesi mejl.")
  .max(254, "Mejl je predugačak.")
  .email("Mejl nije ispravan.")
  .transform((v) => v.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Lozinka mora imati bar 8 znakova.")
  .max(72, "Lozinka može imati najviše 72 znaka.");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Ime mora imati bar 2 znaka.")
  .max(100, "Ime može imati najviše 100 znakova.");

export const registerSchema = z.object({
  full_name: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Unesi lozinku.").max(72),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const updateAccountSchema = z
  .object({
    full_name: fullNameSchema.optional(),
    current_password: z.string().max(72).optional(),
    new_password: passwordSchema.optional(),
  })
  .refine((v) => v.full_name !== undefined || v.new_password !== undefined, {
    message: "Nema šta da se promeni.",
  })
  .refine((v) => v.new_password === undefined || (v.current_password ?? "").length > 0, {
    message: "Unesi trenutnu lozinku da bi promenio lozinku.",
    path: ["current_password"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
