import { MongoClient, Db } from 'mongodb';

class Mongo {
  private static instance: Mongo;
  public client!: MongoClient;
  private _db?: Db;

  public static getInstance(): Mongo {
    if (!Mongo.instance) {
      Mongo.instance = new Mongo();
    }
    return Mongo.instance;
  }

  public async connect(): Promise<MongoClient> {
    if (!this.client) {
      try {
        const user = process.env.DB_USER || '';
        const password = process.env.DB_PASSWORD || '';
        // const dbName = process.env.DB_NAME || 'defaultDbName';

        if (!user || !password) {
          throw new Error('Database credentials are not set.');
        }

        const uri = `mongodb+srv://${user}:${password}@cluster0.c6fei51.mongodb.net/?retryWrites=true&w=majority`;
        this.client = await MongoClient.connect(uri);
        console.log('Connected to db');
      } catch (error) {
        console.error('Failed to connect to the database:', error);
        throw error;
      }
    }
    return this.client;
  }

  get db(): Db {
    if (!this._db) {
      this._db = this.client.db(process.env.DB_NAME);
    }
    return this._db;
  }

  public async close(): Promise<void> {
    await this.client.close();
  }
}

export const mongoInstance = Mongo.getInstance();

// import { MongoClient } from 'mongodb';

// class Mongo {
//   public client: any;

//   public async connect() {
//     const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.c6fei51.mongodb.net/?retryWrites=true&w=majority`;
//     this.client = await MongoClient.connect(uri);
//     console.log('Connected to db');
//     return this.client as MongoClient;
//   }

//   get db() {
//     return this.client.db(process.env.DB_NAME);
//   }
// }

// export = new Mongo();
