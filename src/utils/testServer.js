export async function testServer(testUrl, timeout = 5000) {
  if (isBrowserBlockedTest(testUrl)) {
    return "blocked";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    await fetch(withCacheBuster(testUrl), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    });

    return "online";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

export function isBrowserBlockedTest(testUrl) {
  try {
    const { protocol } = new URL(testUrl);
    return window.location.protocol === "https:" && (protocol === "http:" || protocol === "ftp:");
  } catch {
    return true;
  }
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}
