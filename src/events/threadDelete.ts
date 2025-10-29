import { ThreadChannel } from 'discord.js';
import { event, Events } from '../utils/index.js';
import { promises as fsPromises } from 'fs';
import { getSafeDataPath } from '../utils/pathSafety.js';
import path from 'path';

/**
 * Event to remove the associated .json file for a thread once deleted
 */
export default event(Events.ThreadDelete, async ({ log }, thread: ThreadChannel) => {
    // Iterate through every guild member in the thread and delete their history, except the bot
    try {
        const memberCount = (thread.memberCount ?? 0) - 1;
        log(`Number of User Guild Members in Thread being deleted: ${memberCount}`);

        const dataDir = path.resolve(process.cwd(), 'data');

        // Read all files in data/
        const files = await fsPromises.readdir(dataDir);

        // Filter files by thread id being deleted
        const filesToDiscard = files.filter(
            file => file.startsWith(`${thread.id}-`) && file.endsWith('.json')
        );

        if (filesToDiscard.length === 0) {
            log(`No files found for thread ${thread.id}`);
            return;
        }

        log(`Found ${filesToDiscard.length} files to delete for thread ${thread.id}`);

        // Delete files in parallel
        const deletePromises = filesToDiscard.map(async (file) => {
            try {
                const filePath = getSafeDataPath(file);
                await fsPromises.unlink(filePath);
                log(`Successfully deleted ${file}`);
            } catch (error: unknown) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                log(`Error deleting file ${file}: ${errorMsg}`);
            }
        });

        await Promise.all(deletePromises);
        log(`Thread cleanup complete for ${thread.id}`);

    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        log(`Issue deleting user history files from ${thread.id}: ${errorMsg}`);
    }
});