"use-client";

import { type ReactNode, createContext, useState, useContext } from "react";
import { useStore } from "zustand";
import { type userStore, createUserStore } from "../store/user-store";

export type UserStoreApi = ReturnType<typeof createUserStore>;

export const UserStoreContext = createContext<UserStoreApi | undefined>(
  undefined,
);

export interface UserStoreProviderProps {
  children: ReactNode;
}

export const UserStoreProvider = ({ children }: UserStoreProviderProps) => {
  const [store] = useState(() => createUserStore());
  return (
    <UserStoreContext.Provider value={store}>
      {children}
    </UserStoreContext.Provider>
  );
};

export const useuserStore = <T,>(selector: (store: userStore) => T): T => {
  const userStoreContext = useContext(UserStoreContext);
  if (!userStoreContext) {
    throw new Error(`useUserStore must be used within UserStoreProvider`);
  }
  return useStore(userStoreContext, selector);
};
