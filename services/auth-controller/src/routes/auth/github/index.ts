import { Router } from "express";
import type { CookieOptions, Router as ExpressRouter } from "express";
import crypto from "node:crypto";
import { prisma } from "@krek-ai/db";
import { decryptToken, encryptToken } from "../../../lib/encrypt-tokens.js";
import { requireUserDetails } from "../../../middlewares/require-user-details.js";

const gitAuthRouter: ExpressRouter = Router();

const clientId = process.env.GITHUB_CLIENT_ID;
const redirectUri = process.env.GITHUB_CALLBACK_URL;
const secret = process.env.JWT_SECRET;

if (!clientId || !redirectUri)
  throw new Error("GitHub OAuth is not configured");

if (!secret) throw new Error("JWT_SECRET is required");

const stateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 10 * 60 * 1000,
  path: "/",
};

gitAuthRouter.get("/", requireUserDetails, async (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");
  res.cookie("github_oauth_state", state, stateCookieOptions);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user repo",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

gitAuthRouter.get("/callback", requireUserDetails, async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const returnedState =
      typeof req.query.state === "string" ? req.query.state : null;

    const storedState = req.cookies.github_oauth_state;

    res.clearCookie("github_oauth_state", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    if (!code || !storedState || returnedState !== storedState) {
      return res.status(400).send("Invalid OAuth state");
    }

    if (!clientId || !redirectUri || !process.env.GITHUB_CLIENT_SECRET) {
      return res.status(500).json({ error: "GitHub OAuth is not configured" });
    }

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return res.status(400).json({
        error: tokenData.error ?? "Token exchange failed",
      });
    }

    const encryptedToken = encryptToken(tokenData.access_token);

    await prisma.user.update({
      where: { id: res.locals.user.id },
      data: {
        github_access_token_encrypted: encryptedToken,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? "/";
    return res.redirect(`${frontendUrl}?github=connected`);
  } catch (error) {
    console.error("GitHub OAuth callback failed", error);
    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl) {
      return res.redirect(`${frontendUrl}?github=error`);
    }

    return res.status(500).json({ error: "GitHub OAuth failed" });
  }
});

gitAuthRouter.post("/disconnect", requireUserDetails, async (req, res) => {
  const _user_id = res.locals.user.id;

  const _user = await prisma.user.findUnique({
    where: {
      id: _user_id,
    },
    select: {
      github_access_token_encrypted: true,
    },
  });

  const encryptedToken = _user?.github_access_token_encrypted;

  if (encryptedToken && process.env.GITHUB_CLIENT_SECRET) {
    try {
      const accessToken = decryptToken(encryptedToken);
      const basicAuth = Buffer.from(
        `${clientId}:${process.env.GITHUB_CLIENT_SECRET}`,
      ).toString("base64");

      const githubResponse = await fetch(
        `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
            "User-Agent": "your-app-name",
          },
          body: JSON.stringify({
            access_token: accessToken,
          }),
        },
      );

      if (githubResponse.status !== 204) {
        const error = await githubResponse.text();
        console.error("GitHub OAuth grant revocation failed:", error);
      }
    } catch (error) {
      console.error("GitHub token revocation request failed:", error);
    }
  }

  await prisma.user.update({
    where: { id: _user_id },
    data: { github_access_token_encrypted: null },
  });

  return res.sendStatus(204);
});

gitAuthRouter.post("/me", requireUserDetails, async (req, res) => {
  const _user_id = res.locals.user.id;

  const _user = await prisma.user.findUnique({
    where: {
      id: _user_id,
    },
  });

  const token = decryptToken(_user?.github_access_token_encrypted as string);

  if (!token) {
    return res.status(401).json({ connected: false });
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return res.status(401).json({ connected: false });
  }

  const user = await response.json();
  console.log(user);
  res.json({
    id: user.id,
    login: user.login,
    avatarUrl: user.avatar_url,
  });
});

gitAuthRouter.post("/repos", requireUserDetails, async (req, res) => {
  const userId = res.locals.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { github_access_token_encrypted: true },
  });

  if (!user?.github_access_token_encrypted) {
    return res.status(401).json({ connected: false, repos: [] });
  }

  let token: string;
  try {
    token = decryptToken(user.github_access_token_encrypted);
  } catch (error) {
    console.error("Failed to decrypt GitHub access token", error);
    return res.status(401).json({ connected: false, repos: [] });
  }

  const repos: Array<{
    id: number;
    name: string;
    fullName: string;
    private: boolean;
    htmlUrl: string;
    defaultBranch: string;
    owner: {
      login: string;
      avatarUrl: string;
    };
  }> = [];

  const perPage = 100;
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "krek-ai",
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to fetch GitHub repos", errorText);
      return res.status(401).json({ connected: false, repos: [] });
    }

    const currentPageRepos = (await response.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      html_url: string;
      default_branch: string;
      owner: {
        login: string;
        avatar_url: string;
      };
    }>;

    repos.push(
      ...currentPageRepos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
        },
      })),
    );

    if (currentPageRepos.length < perPage) {
      break;
    }

    page += 1;
  }

  return res.json({ connected: true, repos });
});

export default gitAuthRouter;
