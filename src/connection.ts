import { MongoClient } from 'mongodb';

class Mongo {
  public client: any;
  // MONGODB_URI=mongodb://<username>:<password>@<cluster-address>/<database-name>

  uri =
    'mongodb+srv://alejandroquadri:EPQuadri384@cluster0.lsaoaqz.mongodb.net/?retryWrites=true&w=majority';

  public async connect() {
    this.client = await MongoClient.connect(this.uri);
    console.log('Connected to db');
    return this.client;
  }
}

export = new Mongo();
