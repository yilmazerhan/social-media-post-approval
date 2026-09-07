import { listPermissions } from "@/modules/administration";
import { protectedHandler } from "@/server/http/handler";

export const GET = protectedHandler({ permission: "ROLE_MANAGE" }, async () => {
  return { data: listPermissions() };
});
