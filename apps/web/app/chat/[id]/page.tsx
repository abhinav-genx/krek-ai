"use client";

import { Suspense, use } from "react";
import { UserStoreProvider } from "@/src/providers/user-store-provider";
import { WorkspaceShell } from "@/components/workspace-shell";

// A single chat's live view at `/chat/{id}`. The id is read from the route and
// drives the chat window + workspace pane.
export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <UserStoreProvider>
      <Suspense>
        <WorkspaceShell chatId={id} />
      </Suspense>
    </UserStoreProvider>
  );
}
