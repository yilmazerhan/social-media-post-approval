"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson } from "@/lib/api-client";

const formSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

type FormValues = z.infer<typeof formSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    // Always shows the same confirmation — the endpoint never reveals
    // whether the email exists (AUTHENTICATION.md §2).
    await postJson("/api/v1/auth/password/forgot", values).catch(
      () => undefined,
    );
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="text-center text-sm">
        If an account exists for that email, a reset link has been sent.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-destructive text-sm">{errors.email.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
      <div className="text-center">
        <a
          href="/login"
          className="text-muted-foreground text-sm hover:underline"
        >
          Back to sign in
        </a>
      </div>
    </form>
  );
}
