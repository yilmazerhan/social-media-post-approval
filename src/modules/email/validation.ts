import { z } from "zod";

export const sendTestEmailSchema = z.object({
  to: z.string().email(),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;
