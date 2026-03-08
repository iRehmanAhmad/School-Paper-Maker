import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { AuthUser } from "@/types";

const TOKEN_NAME = "papergen_token";
const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret");

export async function signAuthToken(user: AuthUser) {
  return await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);
}

export async function verifyAuthToken(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload.user as AuthUser;
}

export async function getAuthUserFromCookies() {
  const token = (await cookies()).get(TOKEN_NAME)?.value;
  if (!token) {
    return null;
  }
  try {
    return await verifyAuthToken(token);
  } catch {
    return null;
  }
}

export async function getAuthUserFromRequest(req: NextRequest) {
  const token = req.cookies.get(TOKEN_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    return await verifyAuthToken(token);
  } catch {
    return null;
  }
}

export const authCookie = {
  name: TOKEN_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  },
};