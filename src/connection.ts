import { MongoClient } from 'mongodb';

class Mongo {
  public client: any;
  uri = 'mongodb+srv://quadri:EPQuadri384@quadrierp.weme9.mongodb.net/test';

  public async connect() {
    this.client = await MongoClient.connect(this.uri);
    console.log('Connected to db');
    return this.client;
  }
}

export = new Mongo();
