/**
 * Queue interface defining basic queue operations
 */
interface IQueue<T> {
    enqueue(item: T): void;
    dequeue(): T | undefined;
    size(): number;
}

/**
 * FIFO Queue for managing message history
 *
 * This queue automatically manages capacity by removing oldest items
 * when the limit is reached.
 *
 * Queue order (FIFO - First In, First Out):
 * [oldest] item1 -> item2 -> item3 -> item4 [newest]
 *
 * - enqueue(): adds to the END (newest position)
 * - dequeue(): removes from the FRONT (oldest position)
 * - removeLast(): removes from the END (newest position)
 */
export class Queue<T> implements IQueue<T> {
    private storage: T[] = [];

    /**
     * Creates a new queue with specified capacity
     * @param capacity - Maximum number of items in the queue
     */
    constructor(public capacity: number = 5) {
        if (capacity < 1) {
            throw new Error('Queue capacity must be at least 1');
        }
    }

    /**
     * Adds an item to the end of the queue (newest position)
     * Automatically removes oldest item if queue is at capacity
     *
     * @param item - Item to add to the queue
     *
     * @example
     * queue.enqueue(message);  // Adds to end, removes oldest if full
     */
    enqueue(item: T): void {
        // Auto-dequeue oldest if at capacity
        while (this.size() >= this.capacity) {
            this.dequeue();
        }

        this.storage.push(item);
    }

    /**
     * Removes and returns the oldest item from the queue (FIFO)
     *
     * @returns The oldest item, or undefined if queue is empty
     *
     * @example
     * const oldest = queue.dequeue();  // Removes from front
     */
    dequeue(): T | undefined {
        return this.storage.shift();
    }

    /**
     * Removes the newest item from the queue
     * Useful for error rollback - removing the item that was just added
     *
     * @returns The newest item, or undefined if queue is empty
     *
     * @example
     * queue.enqueue(message);
     * // ... operation fails ...
     * queue.removeLast();  // Remove the message we just added
     */
    removeLast(): T | undefined {
        return this.storage.pop();
    }

    /**
     * Returns the current size of the queue
     *
     * @returns Number of items in the queue
     */
    size(): number {
        return this.storage.length;
    }

    /**
     * Returns a copy of all items in the queue
     * Items are ordered from oldest to newest
     *
     * @returns Array of queue items [oldest, ..., newest]
     */
    getItems(): T[] {
        return [...this.storage];  // Return copy to prevent external modification
    }

    /**
     * Replaces the entire queue contents
     * Validates that new queue doesn't exceed capacity
     *
     * @param newQueue - New array of items to set as queue
     * @throws {Error} If new queue exceeds capacity
     */
    setQueue(newQueue: T[]): void {
        if (newQueue.length > this.capacity) {
            throw new Error(
                `Cannot set queue: ${newQueue.length} items exceeds capacity of ${this.capacity}`
            );
        }
        this.storage = [...newQueue];  // Copy array to prevent external modification
    }

    /**
     * Clears all items from the queue
     */
    clear(): void {
        this.storage = [];
    }

    /**
     * Checks if the queue is empty
     *
     * @returns true if queue has no items, false otherwise
     */
    isEmpty(): boolean {
        return this.storage.length === 0;
    }

    /**
     * Checks if the queue is at capacity
     *
     * @returns true if queue is full, false otherwise
     */
    isFull(): boolean {
        return this.storage.length >= this.capacity;
    }

    /**
     * @deprecated Use removeLast() instead for clarity
     * This method is kept for backwards compatibility
     */
    pop(): void {
        console.warn('[Queue] pop() is deprecated. Use removeLast() instead.');
        this.storage.pop();
    }
}