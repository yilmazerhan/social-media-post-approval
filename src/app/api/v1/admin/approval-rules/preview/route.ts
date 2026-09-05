import { routePreviewSchema, previewApprovalRoute } from "@/modules/approvals";
import { protectedHandler } from "@/server/http/handler";

export const POST = protectedHandler<
  ReturnType<typeof routePreviewSchema.parse>,
  undefined
>(
  {
    schema: routePreviewSchema,
    permission: "SETTINGS_MANAGE",
  },
  async ({ input }) => {
    const result = await previewApprovalRoute({
      ...input,
      departmentId: input.departmentId ?? null,
    });
    return { data: result };
  },
);
