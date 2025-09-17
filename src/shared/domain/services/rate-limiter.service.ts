export const RATE_LIMITER_SERVICE = 'RATE_LIMITER_SERVICE';

export interface RateLimiterService {
  /**
   * Checks if a user has exceeded the rate limit.
   * @param userId The ID of the user.
   * @param limit The maximum number of requests allowed.
   * @param durationSeconds The duration in seconds for the rate limit window.
   * @returns A promise that resolves to true if the limit is exceeded, false otherwise.
   */
  isRateLimited(
    userId: string,
    limit: number,
    durationSeconds: number,
  ): Promise<boolean>;

  /**
   * Records a request for a user.
   * @param userId The ID of the user.
   * @param durationSeconds The duration in seconds for the rate limit window.
   * @returns A promise that resolves when the request is recorded.
   */
  recordRequest(userId: string, durationSeconds: number): Promise<void>;
}
