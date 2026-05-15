import PocketBase from 'pocketbase';

// The URL of your self-hosted PocketBase instance
export const PB_URL = 'https://api.elarisnoir.my.id';

export const pb = new PocketBase(PB_URL);

// Setting up auto-cancellation to false to prevent issues with React concurrency
pb.autoCancellation(false);
