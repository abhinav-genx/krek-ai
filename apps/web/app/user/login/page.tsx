"use client";

import { useState } from "react";
import axios from "axios";
import { setCookie } from "@/src/lib/set-cookie";
import { SERVICES } from "@/src/lib/services";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Page() {
  const [email, set_email] = useState("");
  const [pass, set_pass] = useState("");
  const [loading, set_loading] = useState(false);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    set_loading(true);
    try {
      const res = await axios.post(`${SERVICES.auth}/auth/login`, {
        email,
        pass,
      });
      if (res.status != 200) {
        toast.error("Unauthorized");
        return;
      }
      setCookie("authorization", res?.data?.session, 30);
      window.location.href = "/";
    } catch {
      toast.error("Invalid email or password.");
    } finally {
      set_loading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-1 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <CardTitle className="text-lg">Welcome back</CardTitle>
          <CardDescription>Sign in to your krek-ai account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => set_email(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={pass}
                onChange={(e) => set_pass(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a
              href="/user/signup"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign up
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
