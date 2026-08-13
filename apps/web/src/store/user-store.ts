import { createStore } from "zustand/vanilla";

export type UserState = {
  id: string | null;
  name: string | null;
  email: string | null;
};

export type UserActions = {
  setUser: (userState: UserState) => void;
};

export type userStore = UserState & UserActions;

const defaultUserState: UserState = {
  id: null,
  name: null,
  email: null,
};

export const createUserStore = (userState: UserState = defaultUserState) => {
  return createStore<userStore>()((set) => ({
    ...userState,
    setUser: (nextUserState) => set(() => ({ ...nextUserState })),
  }));
};
