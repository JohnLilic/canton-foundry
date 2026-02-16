const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const RATE_LIMIT_THRESHOLD = 100;

export interface GitHubClientOptions {
  token: string;
  baseUrl?: string;
}

export interface GitHubResponse<T> {
  data: T;
  status: number;
  rateLimit: {
    remaining: number;
    reset: number;
  };
}

export interface GitHubError {
  status: number;
  message: string;
  retryable: boolean;
}

export class GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private lastRateLimit = { remaining: 5000, reset: 0 };

  constructor(options: GitHubClientOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
  }

  /**
   * Make an authenticated GET request to the GitHub API
   * with retry logic and rate-limit handling.
   */
  async get<T>(path: string): Promise<GitHubResponse<T>> {
    let lastError: GitHubError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay =
          INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }

      await this.checkRateLimit();

      try {
        const response = await fetch(
          `${this.baseUrl}${path}`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "canton-ecosystem-observatory",
            },
          },
        );

        this.updateRateLimit(response);

        if (response.status === 404) {
          throw {
            status: 404,
            message: "Not found",
            retryable: false,
          } satisfies GitHubError;
        }

        if (response.status === 403) {
          const remaining = this.lastRateLimit.remaining;
          if (remaining <= 0) {
            throw {
              status: 403,
              message: "Rate limit exceeded",
              retryable: true,
            } satisfies GitHubError;
          }
          throw {
            status: 403,
            message: "Forbidden",
            retryable: false,
          } satisfies GitHubError;
        }

        if (response.status === 409) {
          throw {
            status: 409,
            message: "Conflict (likely empty repository)",
            retryable: false,
          } satisfies GitHubError;
        }

        if (response.status >= 500) {
          lastError = {
            status: response.status,
            message: `Server error: ${response.status}`,
            retryable: true,
          };
          continue;
        }

        if (!response.ok) {
          throw {
            status: response.status,
            message: `HTTP ${response.status}`,
            retryable: false,
          } satisfies GitHubError;
        }

        const data = (await response.json()) as T;
        return {
          data,
          status: response.status,
          rateLimit: { ...this.lastRateLimit },
        };
      } catch (error) {
        if (isGitHubError(error) && !error.retryable) {
          throw error;
        }
        if (isGitHubError(error)) {
          lastError = error;
          continue;
        }

        // Network errors are retryable
        lastError = {
          status: 0,
          message:
            error instanceof Error
              ? error.message
              : "Network error",
          retryable: true,
        };

        if (attempt === MAX_RETRIES) {
          throw lastError;
        }
      }
    }

    throw lastError ?? {
      status: 0,
      message: "Unknown error after retries",
      retryable: false,
    };
  }

  /**
   * Get raw file content from a repo (base64 decoded).
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
  ): Promise<string | null> {
    try {
      const response = await this.get<{
        content: string;
        encoding: string;
      }>(`/repos/${owner}/${repo}/contents/${path}`);

      if (response.data.encoding === "base64") {
        return Buffer.from(
          response.data.content,
          "base64",
        ).toString("utf-8");
      }
      return response.data.content;
    } catch (error) {
      if (isGitHubError(error) && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private updateRateLimit(response: Response): void {
    const remaining = response.headers.get(
      "X-RateLimit-Remaining",
    );
    const reset = response.headers.get("X-RateLimit-Reset");

    if (remaining !== null) {
      this.lastRateLimit.remaining = parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.lastRateLimit.reset = parseInt(reset, 10);
    }
  }

  private async checkRateLimit(): Promise<void> {
    if (this.lastRateLimit.remaining < RATE_LIMIT_THRESHOLD) {
      const now = Math.floor(Date.now() / 1000);
      const waitSeconds = Math.max(
        0,
        this.lastRateLimit.reset - now + 1,
      );
      if (waitSeconds > 0 && waitSeconds < 3600) {
        await this.sleep(waitSeconds * 1000);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getRateLimitInfo(): { remaining: number; reset: number } {
    return { ...this.lastRateLimit };
  }
}

export function isGitHubError(
  error: unknown,
): error is GitHubError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    "retryable" in error
  );
}

/**
 * Parse a GitHub repo URL into owner and repo name.
 * Handles https://github.com/owner/repo and variants.
 */
export function parseRepoUrl(
  url: string,
): { owner: string; repo: string } | null {
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/,
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}
