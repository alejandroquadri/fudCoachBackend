import {
  ObjectId,
  Filter,
  Db,
  WithId,
  Document,
  OptionalUnlessRequiredId,
  Sort,
  UpdateResult,
  DeleteResult,
  UpdateFilter,
} from 'mongodb';
import { mongoInstance } from '../connection';

// Define a type that includes the timestamp fields
type TimestampedDocument = Document & {
  createdAt?: Date;
  updatedAt?: Date;
};

// Ensure that T extends TimestampedDocument
export class MongoService<T extends TimestampedDocument> {
  private collectionName: string;
  private db: Db;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
    this.db = mongoInstance.db;
  }

  /**
   * Insert a new document into the collection.
   * @param document - The document to be inserted
   * @returns The inserted document with its generated _id
   */
  async create(
    document: OptionalUnlessRequiredId<T>
  ): Promise<{ acknowledged: boolean; insertedId: ObjectId }> {
    document = {
      ...document,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await this.db
      .collection<T>(this.collectionName)
      .insertOne(document);

    return { acknowledged: result.acknowledged, insertedId: result.insertedId };
  }

  /**
   * Update an existing document by its ID.
   * @param id - The document ID, either as a string or ObjectId
   * @param updateData - The data to update in the document
   * @returns True if the document was updated, otherwise false
   */
  async update(
    id: string | ObjectId,
    updateData: Partial<T>
  ): Promise<UpdateResult<T>> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    updateData = {
      ...updateData,
      updatedAt: new Date(),
    };
    return this.db
      .collection<T>(this.collectionName)
      .updateOne({ _id: objectId } as Filter<T>, { $set: updateData });
  }

  /**
   * Update an existing document or insert a new one if it doesn't exist.
   * @param filter - The filter to locate the document
   * @param document - The data to update or insert in the document
   * @returns The result of the upsert operation
   */

  upsert(filter: Filter<T>, document: Partial<T>): Promise<UpdateResult<T>> {
    return this.db
      .collection<T>(this.collectionName)
      .updateOne(filter, document, { upsert: true });
  }

  /**
   * Delete a document by its ID.
   * @param id - The document ID, either as a string or ObjectId
   * @returns True if the document was deleted, otherwise false
   */
  async delete(id: string | ObjectId): Promise<DeleteResult> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    return await this.db
      .collection<T>(this.collectionName)
      .deleteOne({ _id: objectId } as Filter<T>);
  }

  /**
   * Find documents based on a custom query.
   * @param query - The filter query to use for finding documents
   * @param options - Optional query options like sorting and limiting
   * @returns An array of documents matching the query
   */
  async find(
    query: Filter<T>,
    options?: { sort?: Sort; limit?: number }
  ): Promise<WithId<T>[]> {
    let cursor = this.db.collection<T>(this.collectionName).find(query);

    // Apply sorting if the sort option is provided
    if (options?.sort) {
      cursor = cursor.sort(options.sort);
    }

    // Apply limiting if the limit option is provided
    if (options?.limit) {
      cursor = cursor.limit(options.limit);
    }

    // Convert the cursor to an array and return the result
    return cursor.toArray();
  }

  /**
   * Find a single document based on a query.
   * @param query - The filter query to use for finding a document
   * @returns The found document or null
   */
  async findOne(query: Filter<T>): Promise<WithId<T> | null> {
    return this.db.collection<T>(this.collectionName).findOne(query);
  }
}
