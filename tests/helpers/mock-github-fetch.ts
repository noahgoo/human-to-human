/** Avoids burning GitHub rate limits during Jev integration tests. */
export function mockGithubFetch(realFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.github.com")) {
      if (url.includes("/users/") && url.includes("/repos")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ tree: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return realFetch(input, init);
  };
}
