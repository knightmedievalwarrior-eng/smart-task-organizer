const API = "https://api.github.com";

export function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Stepwise-Command-Center",
  };
}

export async function githubRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: T | null }> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...githubHeaders(token),
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
    cache: "no-store",
  });
  let body: T | null = null;
  try {
    body = (await response.json()) as T;
  } catch {
    /* GitHub may return no body. */
  }
  return { response, body };
}

export function safeGithubError(status: number): string {
  if (status === 401) return "github_token_invalid";
  if (status === 403) return "github_permission_or_rate_limit";
  if (status === 404) return "github_resource_not_found";
  if (status === 409) return "github_conflict_retry_sync";
  if (status === 422) return "github_validation_failed";
  return `github_http_${status}`;
}
