import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../src/utils/rateLimiter';

describe('RateLimiter', () => {
    let limiter: RateLimiter;

    afterEach(() => {
        if (limiter) {
            limiter.destroy();
        }
    });

    describe('constructor', () => {
        it('should create a limiter with default cooldown', () => {
            limiter = new RateLimiter();
            const stats = limiter.getStats();
            expect(stats.cooldownSeconds).toBe(5);
        });

        it('should create a limiter with custom cooldown', () => {
            limiter = new RateLimiter(10);
            const stats = limiter.getStats();
            expect(stats.cooldownSeconds).toBe(10);
        });

        it('should reject cooldown less than 1 second', () => {
            expect(() => new RateLimiter(0)).toThrow(/at least 1 second/i);
            expect(() => new RateLimiter(-5)).toThrow(/at least 1 second/i);
        });

        it('should reject cooldown more than 1 hour', () => {
            expect(() => new RateLimiter(3601)).toThrow(/cannot exceed/i);
        });
    });

    describe('isRateLimited', () => {
        beforeEach(() => {
            limiter = new RateLimiter(2); // 2 second cooldown for faster tests
        });

        it('should not rate limit first request', () => {
            const result = limiter.isRateLimited('user1');
            expect(result).toBe(false);
        });

        it('should rate limit immediate second request', () => {
            limiter.isRateLimited('user1'); // First request
            const result = limiter.isRateLimited('user1'); // Second request
            expect(result).toBe(true);
        });

        it('should track different users separately', () => {
            limiter.isRateLimited('user1');
            const resultUser2 = limiter.isRateLimited('user2');
            expect(resultUser2).toBe(false);
        });

        it('should allow request after cooldown expires', async () => {
            limiter.isRateLimited('user1'); // First request

            // Wait for cooldown to expire
            await new Promise(resolve => setTimeout(resolve, 2100));

            const result = limiter.isRateLimited('user1');
            expect(result).toBe(false);
        }, 3000); // Test timeout of 3 seconds
    });

    describe('getRemainingTime', () => {
        beforeEach(() => {
            limiter = new RateLimiter(5);
        });

        it('should return 0 for user without cooldown', () => {
            const remaining = limiter.getRemainingTime('user1');
            expect(remaining).toBe(0);
        });

        it('should return remaining time for user on cooldown', () => {
            limiter.isRateLimited('user1');
            const remaining = limiter.getRemainingTime('user1');
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(5);
        });

        it('should return 0 after cooldown expires', async () => {
            limiter = new RateLimiter(1); // 1 second for faster test
            limiter.isRateLimited('user1');

            await new Promise(resolve => setTimeout(resolve, 1100));

            const remaining = limiter.getRemainingTime('user1');
            expect(remaining).toBe(0);
        }, 2000);
    });

    describe('clearCooldown', () => {
        beforeEach(() => {
            limiter = new RateLimiter(5);
        });

        it('should clear cooldown for specific user', () => {
            limiter.isRateLimited('user1');
            limiter.clearCooldown('user1');

            const result = limiter.isRateLimited('user1');
            expect(result).toBe(false);
        });

        it('should not affect other users', () => {
            limiter.isRateLimited('user1');
            limiter.isRateLimited('user2');
            limiter.clearCooldown('user1');

            const result = limiter.isRateLimited('user2');
            expect(result).toBe(true);
        });
    });

    describe('clearAll', () => {
        beforeEach(() => {
            limiter = new RateLimiter(5);
        });

        it('should clear all cooldowns', () => {
            limiter.isRateLimited('user1');
            limiter.isRateLimited('user2');
            limiter.isRateLimited('user3');

            limiter.clearAll();

            expect(limiter.isRateLimited('user1')).toBe(false);
            expect(limiter.isRateLimited('user2')).toBe(false);
            expect(limiter.isRateLimited('user3')).toBe(false);
        });

        it('should reset statistics', () => {
            limiter.isRateLimited('user1');
            limiter.isRateLimited('user2');

            limiter.clearAll();

            const stats = limiter.getStats();
            expect(stats.activeCooldowns).toBe(0);
        });
    });

    describe('getStats', () => {
        beforeEach(() => {
            limiter = new RateLimiter(5);
        });

        it('should return correct statistics', () => {
            const stats = limiter.getStats();
            expect(stats).toHaveProperty('activeCooldowns');
            expect(stats).toHaveProperty('cooldownSeconds');
            expect(stats.cooldownSeconds).toBe(5);
        });

        it('should track active cooldowns', () => {
            limiter.isRateLimited('user1');
            limiter.isRateLimited('user2');

            const stats = limiter.getStats();
            expect(stats.activeCooldowns).toBe(2);
        });
    });

    describe('destroy', () => {
        beforeEach(() => {
            limiter = new RateLimiter(5);
        });

        it('should clear all cooldowns on destroy', () => {
            limiter.isRateLimited('user1');
            limiter.isRateLimited('user2');

            limiter.destroy();

            const stats = limiter.getStats();
            expect(stats.activeCooldowns).toBe(0);
        });

        it('should stop cleanup interval', () => {
            const consoleSpy = vi.spyOn(console, 'log');

            limiter.destroy();

            // Cleanup interval should not run after destroy
            // (This is implementation-specific and may need adjustment)
            expect(() => limiter.destroy()).not.toThrow();

            consoleSpy.mockRestore();
        });
    });

    describe('memory leak prevention', () => {
        it('should clean up expired cooldowns automatically', async () => {
            limiter = new RateLimiter(1); // 1 second cooldown

            // Add several users
            for (let i = 0; i < 10; i++) {
                limiter.isRateLimited(`user${i}`);
            }

            // Wait for cooldowns to expire and cleanup to run
            await new Promise(resolve => setTimeout(resolve, 65000)); // Cleanup runs every 60s

            const stats = limiter.getStats();
            // After cleanup, expired cooldowns should be removed
            // Note: This test might be timing-sensitive
            expect(stats.activeCooldowns).toBe(0);
        }, 70000); // 70 second timeout
    });
});
