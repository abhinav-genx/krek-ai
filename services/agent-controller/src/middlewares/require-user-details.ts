import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@krek-ai/db";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");

type AuthPayload = jwt.JwtPayload & {
  userid?: string;
};

export const requireUserDetails: RequestHandler = async (req, res, next) => {
  const headerAuthorization = req.cookies?.authorization;

  const bodyAuthorization =
    typeof req.body?.authorization === "string"
      ? req.body.authorization
      : undefined;

  // EventSource can't set headers or send a body, so SSE routes pass the token
  // as ?authorization=... instead.
  const queryAuthorization =
    typeof req.query?.authorization === "string"
      ? req.query.authorization
      : undefined;

  const authorization =
    headerAuthorization ?? bodyAuthorization ?? queryAuthorization;

  if (!authorization) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : authorization;

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;

    if (!payload.userid) {
      return res.status(401).json({ error: "unauthorized user" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userid },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "unauthorized user" });
    }

    res.locals.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized user" });
  }
};
