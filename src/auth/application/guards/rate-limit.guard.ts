import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RateLimiterService,
  RATE_LIMITER_SERVICE,
} from '../../../shared/domain/services/rate-limiter.service'; // Import RATE_LIMITER_SERVICE
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(RATE_LIMITER_SERVICE)
    private readonly rateLimiterService: RateLimiterService, // Use @Inject with the token
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // Skip rate limiting for public routes
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId; // Assuming userId is available in request.user after authentication

    if (!userId) {
      // If there's no user ID, it means the route is protected but no user is authenticated.
      // This scenario should ideally be handled by an AuthGuard before RateLimitGuard.
      // For now, we'll allow it to pass, assuming AuthGuard will handle unauthenticated access.
      return true;
    }

    const limit = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10);
    const durationSeconds = parseInt(
      process.env.RATE_LIMIT_WINDOW_SECONDS || '60',
      10,
    );

    const isLimited = await this.rateLimiterService.isRateLimited(
      userId,
      limit,
      durationSeconds,
    );

    if (isLimited) {
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.rateLimiterService.recordRequest(userId, durationSeconds);

    return true;
  }
}
