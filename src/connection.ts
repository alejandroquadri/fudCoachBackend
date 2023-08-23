import { MongoClient } from 'mongodb';

class Mongo {
  public client: any;

  public async connect() {
    const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.c6fei51.mongodb.net/?retryWrites=true&w=majority`;
    this.client = await MongoClient.connect(uri);
    console.log('Connected to db');
    return this.client;
  }
}

export = new Mongo();
