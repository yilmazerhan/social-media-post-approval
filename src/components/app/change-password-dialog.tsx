"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ApiError, CSRF_COOKIE_NAME, postJson } from "@/lib/api-client";

const formSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(1, "Enter a new password."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof formSchema>;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    try {
      await postJson(
        "/api/v1/auth/password/change",
        {
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        },
        { csrfCookieName: CSRF_COOKIE_NAME },
      );
      toast({ title: "Password changed." });
      reset();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          for (const detail of err.details) {
            setError("newPassword", { message: detail.message });
          }
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Something went wrong. Try again.");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              You&apos;ll stay signed in on this device; every other session is
              signed out.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.currentPassword}
                {...register("currentPassword")}
              />
              {errors.currentPassword && (
                <p className="text-destructive text-sm">
                  {errors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register("newPassword")}
              />
              {errors.newPassword && (
                <p className="text-destructive text-sm">
                  {errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-destructive text-sm">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>
            {formError && (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Changing…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
