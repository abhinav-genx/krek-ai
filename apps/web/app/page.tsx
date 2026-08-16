"use client";

import { Suspense } from "react";
import { UserStoreProvider } from "@/src/providers/user-store-provider";
import { WorkspaceShell } from "@/components/workspace-shell";

// Landing / new-chat page. Starting a task navigates to `/chat/{id}`.
export default function Page() {
  return (
    <UserStoreProvider>
      <Suspense>
        <WorkspaceShell />
      </Suspense>
    </UserStoreProvider>
  );
}
