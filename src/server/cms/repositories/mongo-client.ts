import "server-only";

import { MongoClient } from "mongodb";

import { getMongoDatabaseName } from "@/server/cms/config";

type MongoGlobal = typeof globalThis & {
  __siriraneeMongoClientPromise?: Promise<MongoClient>;
};

function getMongoUri() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is required when CMS_MODE is mongodb.");
  }

  return uri;
}

export function getMongoClient() {
  const mongoGlobal = globalThis as MongoGlobal;

  if (!mongoGlobal.__siriraneeMongoClientPromise) {
    const client = new MongoClient(getMongoUri(), {
      appName: "siriranee-thai-massage",
      maxPoolSize: 10,
      retryWrites: true,
    });
    const connectionPromise = client.connect().catch(async (error) => {
      if (mongoGlobal.__siriraneeMongoClientPromise === connectionPromise) {
        delete mongoGlobal.__siriraneeMongoClientPromise;
      }
      await client.close().catch(() => undefined);
      throw error;
    });
    mongoGlobal.__siriraneeMongoClientPromise = connectionPromise;
  }

  return mongoGlobal.__siriraneeMongoClientPromise;
}

export async function getMongoDatabase() {
  const client = await getMongoClient();
  return client.db(getMongoDatabaseName());
}
