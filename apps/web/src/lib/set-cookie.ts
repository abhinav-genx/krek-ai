export function setCookie(name: string, value: string, days: number) {
  const maxAge = days * 24 * 60 * 60;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const authServiceUrl = process.env.NEXT_PUBLIC_CONTROLLER_SERVICE_URL;

  let domainPart = "";
  if (authServiceUrl) {
    try {
      const hostname = new URL(authServiceUrl).hostname;
      const isLocalhost =
        hostname === "localhost" ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
        hostname === "::1";

      if (!isLocalhost) {
        domainPart = `; Domain=${hostname}`;
      }
    } catch {
      // Ignore invalid URL and set cookie without Domain.
    }
  }

  document.cookie =
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ` +
    `Path=/; Max-Age=${maxAge}${domainPart}; SameSite=Lax${secure}`;
}
