import { z } from "zod";

export const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(10, { error: "Use at least 10 characters." }),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, { error: "Enter your full name." }),
  email: z.email({ error: "Enter a valid email address." }),
  password: z.string().min(10, { error: "Use at least 10 characters." }),
  role: z.enum(["applicant", "recruiter"]),
});

export const emailSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
});

export const passwordSchema = z
  .object({
    password: z.string().min(10, { error: "Use at least 10 characters." }),
    confirm: z.string().min(10, { error: "Use at least 10 characters." }),
  })
  .refine((value) => value.password === value.confirm, {
    error: "Passwords must match.",
    path: ["confirm"],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type EmailValues = z.infer<typeof emailSchema>;
export type PasswordValues = z.infer<typeof passwordSchema>;
