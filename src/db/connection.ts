import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

/** Connects the default mongoose connection and makes sure every model's indexes exist. */
export async function connectDatabase(uri: string, options: mongoose.ConnectOptions = {}): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, ...options });
  await mongoose.connection.syncIndexes();
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
