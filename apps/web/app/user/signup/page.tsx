"use client";

import { useState } from "react";
import axios from "axios";
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
  const [name, set_name] = useState("");
  const [email, set_email] = useState("");
  const [pass, set_pass] = useState("");
  const [loading, set_loading] = useState(false);

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    set_loading(true);
    try {
      const res = await axios.post(`${SERVICES.auth}/auth/signup`, {
        name,
        email,
        pass,
      });
      if (res.status == 200) {
        toast.success("Account created. Please sign in.");
        window.location.href = "/user/login";
      } else {
        toast.error("Could not create account.");
      }
    } catch {
      toast.error("Could not create account.");
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
          <CardTitle className="text-lg">Create your account</CardTitle>
          <CardDescription>Start building with krek-ai</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSignup} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ada Lovelace"
                value={name}
                onChange={(e) => set_name(e.target.value)}
                required
              />
            </div>
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
              Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a
              href="/user/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
