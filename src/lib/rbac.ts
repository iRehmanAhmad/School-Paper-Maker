import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";

export async function requireRole(req: NextRequest, allowed: Role[]) {
  const user = await getAuthUserFromRequest(req);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (!allowed.includes(user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}

export function assertSchoolAccess(targetSchoolId: string | null, actorSchoolId: string | null, actorRole: Role) {
  if (actorRole === Role.SUPER_ADMIN) {
    return true;
  }

  if (!targetSchoolId || !actorSchoolId || actorSchoolId !== targetSchoolId) {
    return false;
  }

  return true;
}