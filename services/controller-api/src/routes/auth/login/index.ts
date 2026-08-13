import { Router, type Router as ExpressRouter } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@krek-ai/db";

const loginRouter : ExpressRouter = Router();
const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error("JWT_SECRET is required");
}

loginRouter.post("/", async (req, res) => {
  const { email, pass } = req.body ?? {};

  if (!email || !pass) {
    res.status(400).json({ error: "email and pass are required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) return res.status(401).json({ error: "user not found" });

  const payload = {
    userid: user.id,
  };

  const token = jwt.sign(payload, secret, { expiresIn: "2000h" });

  res.json({ message: "logged in", session: token });
});

export default loginRouter;
