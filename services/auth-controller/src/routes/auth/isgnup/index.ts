import { Router, type Router as ExpressRouter } from "express";
import { prisma } from "@krek-ai/db";
import { hashPassword } from "../../../lib/hash-pass.js";

const signupRouter : ExpressRouter = Router();

signupRouter.post("/", async (req, res) => {
  console.log("signup route");
  const { name, email, pass } = req.body ?? {};

  if (!name || !email || !pass)
    return res.status(400).json({ error: "Missing fields" });

  const passwordHash =  hashPassword(pass)

  await prisma.user.create({
    data: { name, email, passwordHash },
  });
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });
  if (!user) return res.status(400).json({ error: "Cannot create the user" });
  res.status(200).json({ message: "user created successfully" });
});

signupRouter.get("/health", (req, res) => {
  console.log("All Good")
  res.status(200).json({ message: "All Good !!!" });
});

export default signupRouter;
