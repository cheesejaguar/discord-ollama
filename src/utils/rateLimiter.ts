import { Collection } from 'discord.js';

/**
 * Simple rate limiter for preventing spam and abuse
 *
 * Uses a cooldown-based approach where each user must wait
 * a specified amount of time between actions.
 */
export class RateLimiter {
    private cooldowns = new Collection<string, number>();
    private readonly cooldownMs: number;
    private cleanupInterval: NodeJS.Timeout | null = null;

    /**
     * Create a new rate limiter
     * @param cooldownSeconds - Number of seconds users must wait between actions
     */
    constructor(cooldownSeconds: number = 5) {
        if (cooldownSeconds < 1) {
            throw new Error('Cooldown must be at least 1 second');
        }
        if (cooldownSeconds > 3600) {
            throw new Error('Cooldown cannot exceed 1 hour (3600 seconds)');
        }

        this.cooldownMs = cooldownSeconds * 1000;

        // Clean up expired cooldowns every minute
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000);
    }

    /**
     * Check if a user is currently rate limited
     * @param userId - Discord user ID
     * @returns true if the user should be rate limited, false if they can proceed
     */
    isRateLimited(userId: string): boolean {
        const now = Date.now();
        const cooldownExpires = this.cooldowns.get(userId);

        if (cooldownExpires && now < cooldownExpires) {
            // Still on cooldown
            return true;
        }

        // Set new cooldown
        this.cooldowns.set(userId, now + this.cooldownMs);

        return false;
    }

    /**
     * Get the remaining cooldown time for a user
     * @param userId - Discord user ID
     * @returns Remaining seconds (rounded up), or 0 if no cooldown
     */
    getRemainingTime(userId: string): number {
        const cooldownExpires = this.cooldowns.get(userId);
        if (!cooldownExpires) return 0;

        const remaining = cooldownExpires - Date.now();
        return Math.max(0, Math.ceil(remaining / 1000));
    }

    /**
     * Clear the cooldown for a specific user
     * @param userId - Discord user ID
     */
    clearCooldown(userId: string): void {
        this.cooldowns.delete(userId);
    }

    /**
     * Clear all cooldowns
     */
    clearAll(): void {
        this.cooldowns.clear();
    }

    /**
     * Clean up expired cooldowns to prevent memory leaks
     */
    private cleanup(): void {
        const now = Date.now();
        let removed = 0;

        for (const [userId, expires] of this.cooldowns.entries()) {
            if (now >= expires) {
                this.cooldowns.delete(userId);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`[RateLimiter] Cleaned up ${removed} expired cooldowns`);
        }
    }

    /**
     * Get current statistics
     */
    getStats(): { activeCooldowns: number; cooldownSeconds: number } {
        return {
            activeCooldowns: this.cooldowns.size,
            cooldownSeconds: this.cooldownMs / 1000
        };
    }

    /**
     * Stop the cleanup interval (call on shutdown)
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.cooldowns.clear();
    }
}
