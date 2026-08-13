export function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    //@ts-ignore
    return decodeURIComponent(parts.pop().split(";").shift());
  }
  return null;
}
