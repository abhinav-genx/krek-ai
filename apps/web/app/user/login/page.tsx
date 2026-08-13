"use client";

import { useState } from "react";
import axios from "axios";
import { setCookie } from "@/src/lib/set-cookie";

export default function Page() {
  const [email, set_email] = useState("");
  const [pass, set_pass] = useState("");

  const onloginClick = async () => {
    try {
      const res = await axios.post("http://localhost:4000/auth/login", {
        email,
        pass,
      });
      if (res.status != 200) return window.alert("unauthorized");
      setCookie("authorization", res?.data?.session, 30);
      console.log(res?.data?.session)
      window.location.href = "/";
    } catch {
      window.alert("unauthorized");
    }
  };

  return (
    <div>
      <input
        className="bg-orange-500"
        type="text"
        value={email}
        onChange={(e) => set_email(e.target.value)}
      />
      <input
        className="bg-orange-500"
        type="text"
        value={pass}
        onChange={(e) => set_pass(e.target.value)}
      />
      <button onClick={onloginClick}>Login</button>
    </div>
  );
}
