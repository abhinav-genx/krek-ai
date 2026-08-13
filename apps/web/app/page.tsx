"use client";

import { fetchuser } from "@/src/lib/fetch-user";
import {
  UserStoreProvider,
  useuserStore,
} from "@/src/providers/user-store-provider";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { getCookie } from "@/src/lib/get-cookie";

export default function Page() {
  return (
    <UserStoreProvider>
      <PageContent />
    </UserStoreProvider>
  );
}

function PageContent() {
  const [user_prompt, set_user_prompt] = useState("");
  const { id, name, email, setUser } = useuserStore((state) => state);
  const [user_github_details, set_user_github_details] = useState<{
    id: string;
    login: string;
    avatarUrl: string;
  }>();
  const [user_repos, set_user_repos] = useState<string[]>([]);

  console.log("reppos", user_repos);

  const searchParams = useSearchParams();
  const github_connected = searchParams.get("github");

  const onLoad = async () => {
    if (github_connected == "connected")
      alert("Github has been successfully connected.");

    const user = await fetchuser();
    if (!user) return;

    const res_github_details = await axios.post(
      "http://localhost:4000/auth/github/me",
      {
        authorization: getCookie("authorization"),
      },
    );
    set_user_github_details(res_github_details.data);

    const res_reppos = await axios.post(
      "http://localhost:4000/auth/github/repos",
      {
        authorization: getCookie("authorization"),
      },
    );
    console.log("repos : ");
    console.log(res_reppos.data.repos);

    set_user_repos(res_reppos.data.repos.map((r: any) => r.fullName));

    setUser({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  };

  const disconnectGithub = async () => {
    const res = await axios.post(
      "http://localhost:4000/auth/github/disconnect",
      {
        authorization: getCookie("authorization"),
      },
    );
    if (res.status == 204) {
      alert("Disconnect success");
    } else {
      alert("Disconnect unsuccessfull");
    }
  };

  useEffect(() => {
    onLoad();
  }, []);

  const onUserSubmit = () => {
    alert(user_prompt);
  };

  return (
    <div className="w-screen h-screen bg-white">
      <h1 className="text-black">Hello {name}</h1>
      <br />
      <h1 className="text-black">Enter prompt</h1>
      <form>
        <textarea
          className="border-2"
          value={user_prompt}
          onChange={(e) => set_user_prompt(e.target.value)}
        ></textarea>
        <button className="bg-blue-700" onClick={onUserSubmit}>
          Send
        </button>
      </form>
      <button
        onClick={() =>
          (user_github_details?.login?.length ?? 0) > 1
            ? disconnectGithub()
            : (window.location.href = "http://localhost:4000/auth/github")
        }
        className="p-3 bg-gray-200 text-black font-bold"
      >
        {(user_github_details?.login?.length ?? 0) > 1
          ? `Connected ${user_github_details?.login}`
          : "Connectx gihub"}
      </button>
      <br />
      <br />
      <div>
        <h1 className="text-black bold ">Select reppos to start :</h1>
        {user_repos.map((r: any) => (
          <button key={r} className="bg-gray-600 p-1">
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
