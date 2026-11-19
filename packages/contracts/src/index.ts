import { z } from 'zod';

export const roleNameSchema = z.enum(['collector', 'artist', 'admin']);
export type RoleName = z.infer<typeof roleNameSchema>;

export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value), {
    message: 'Password must include upper and lower case letters and a number',
  });

export const clientKindSchema = z.enum(['web', 'native']).default('web');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  client: clientKindSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  client: clientKindSchema.optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
  client: clientKindSchema.optional(),
});

export const oauthSchema = z.object({
  idToken: z.string().min(20),
  client: clientKindSchema.optional(),
});

export const mfaConfirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
});

export const mfaChallengeSchema = z.object({
  mfaToken: z.string().min(20),
  code: z.string().trim().min(6).max(32),
  client: clientKindSchema.optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/** A 6-digit code sent by email, for a password reset or to confirm an address. */
export const emailCodeSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email');

export const checkResetCodeSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  code: emailCodeSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password: passwordSchema,
});

export const updateMeSchema = z
  .object({
    phone: z.string().trim().min(7).max(20).nullable(),
  })
  .partial();

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().min(1).max(20),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  phone: z.string().trim().min(7).max(20).optional(),
  isDefaultShipping: z.boolean().optional(),
});

export const updateAddressSchema = addressSchema.partial();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type OauthInput = z.infer<typeof oauthSchema>;
export type MfaConfirmInput = z.infer<typeof mfaConfirmSchema>;
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CheckResetCodeInput = z.infer<typeof checkResetCodeSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
