"use client";

import { useState } from "react";
import axios from "axios";
import { setCookie } from "@/src/lib/set-cookie";

export default function Page() {
  const [name, set_name] = useState("");
  const [email, set_email] = useState("");
  const [pass, set_pass] = useState("");

  const onloginClick = async () => {
    const res = await axios.post("http://127.0.0.1:4000/auth/signup", {
      name,
      email,
      pass,
    });
    if (res.status == 200) window.location.href = "/user/login" 
  };

  return (
    <div className="">
      <b>name</b>
      <input
        className="bg-orange-500"
        type="text"
        value={name}
        onChange={(e) => set_name(e.target.value)}
      />
      <b>Email</b>
      <input
        className="bg-orange-500"
        type="text"
        value={email}
        onChange={(e) => set_email(e.target.value)}
      />
      <b>pass</b>
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
