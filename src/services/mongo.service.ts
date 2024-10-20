import {
  ObjectId,
  OptionalId,
  Filter,
  Db,
  WithId,
  Document,
  OptionalUnlessRequiredId,
  Sort,
  UpdateResult,
  DeleteResult,
} from 'mongodb';
import { startOfDay, endOfDay } from 'date-fns';
import { mongoInstance } from '../connection';

// Ensure that T extends Document so that it is compatible with MongoDB documents.
export class MongoService<T extends Document> {
  private collectionName: string;
  private db: Db;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
    this.db = mongoInstance.db;
  }

  /**
   * Find a single document based on a query.
   * @param query - The filter query to use for finding a document
   * @returns The found document or null
   */
  async findOne(query: Filter<T>): Promise<WithId<T> | null> {
    return this.db.collection<T>(this.collectionName).findOne(query);
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
}

// /**
//  * Get documents by date range for a specific user.
//  * @param userId - The user's ID, either as a string or ObjectId
//  * @param date - The date for which logs are fetched
//  * @returns An array of documents
//  */
// async getByDate(userId: string | ObjectId, date: Date): Promise<WithId<T>[]> {
//   const objectId = typeof userId === 'string' ? new ObjectId(userId) : userId;
//   const startDate = startOfDay(date);
//   const endDate = endOfDay(date);

//   const query = {
//     userId: objectId,
//     date: { $gte: startDate, $lt: endDate },
//   };

//   // Return documents, ensuring the _id field is included (WithId<T>)
//   return this.db
//     .collection<T>(this.collectionName)
//     .find(query as unknown as Filter<T>)
//     .sort({ date: 1 })
//     .toArray();
// }
