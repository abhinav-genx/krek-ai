import axios from "axios";
import { getCookie } from "./get-cookie";

export const fetchuser = async () => {
  const auth_cookie = getCookie("authorization");
  if (!auth_cookie) {
    window.location.href = "/user/login";
    return null;
  }

  try {
    const res = await axios.post("http://localhost:4000/user/details", {
      authorization: `Bearer ${auth_cookie}`,
    });

    if (!res.data.user) {
      window.location.href = "/user/login";
      return null;
    }

    return res.data.user;
  } catch {
    window.location.href = "/user/login";
    return null;
  }
};
