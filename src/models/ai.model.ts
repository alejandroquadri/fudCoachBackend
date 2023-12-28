import { ObjectId } from 'mongodb';
import { mongoInstance } from '../connection';
import { format } from 'date-fns';

export class AiModel {
  saveChatHistory = async (chatHistory: unknown, userId: string | ObjectId) => {
    console.log(
      'desde ai model, intento guardar chat history',
      chatHistory,
      userId
    );
    return mongoInstance.db.collection('aiChatHistory').insertOne({
      _id: new ObjectId(userId),
      chatHistory,
    });
  };

  getChatHistory = (userId: string | ObjectId) => {
    return mongoInstance.db
      .collection('aiChatHistory')
      .findOne({ _id: new ObjectId(userId) });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveFoodLog = async (userId: string, foodStrObj: string) => {
    try {
      const foodObj = this.convertStringToObject(foodStrObj);
      console.log('converted obj', foodObj);
      return mongoInstance.db.collection('foodLogs').insertOne({
        userId: new ObjectId(userId),
        dateString: format(new Date(), 'yyyy-MM-dd'),
        date: new Date(),
        foodObj,
      });
    } catch (error) {
      console.error('Error saving food log:', error);
      throw error;
    }
  };

  saveWeightLog = async (userId: string, weightLog: number) => {
    try {
      const result = await mongoInstance.db.collection('users').updateOne(
        { _id: new ObjectId(userId) }, // Filter to match the document
        {
          $push: { weightLogs: { weightLog, date: new Date() } }, // Push the new weight log to the array
        },
        { upsert: false } // Set to true if you want to create a new document when no document matches
      );
      return result;
    } catch (error) {
      console.error('Error saving weight log:', error);
      throw error;
    }
  };

  upsertArrayPoperty = async (
    userId: string,
    propertyName: string,
    value: any,
    upsert?: boolean
  ) => {
    try {
      const result = await mongoInstance.db.collection('users').updateOne(
        { _id: new ObjectId(userId) }, // Filter to match the document
        {
          $push: { [propertyName]: value }, // Push the new weight log to the array
        },
        { upsert } // Set to true if you want to create a new document when no document matches
      );
      return result;
    } catch (error) {
      console.error(`Error saving ${propertyName}:`, error);
      throw error;
    }
  };

  saveOrUpdateProperty = async (
    userId: string,
    propertyName: string,
    propertyValue: string | number | boolean | object,
    upsert?: boolean
  ) => {
    try {
      const result = await mongoInstance.db.collection('users').updateOne(
        { _id: new ObjectId(userId) }, // Filter to match the document
        {
          $set: { [propertyName]: propertyValue }, // Set the new value for the property
        },
        { upsert } // Set to true if you want to create a new document when no document matches
      );
      return result;
    } catch (error) {
      console.error(`Error saving ${propertyName}:`, error);
      throw error;
    }
  };

  private convertStringToObject = (str: string) => {
    try {
      // Remove the outer curly braces
      let formattedStr = str.replace(/{|}/g, '');

      // Add double quotes around keys
      formattedStr = formattedStr.replace(/([a-zA-Z0-9]+):/g, '"$1":');

      // Add double quotes around string values
      formattedStr = formattedStr.replace(/: ([a-zA-Z ]+)(,|$)/g, ': "$1"$2');

      // Enclose entire string in curly braces
      formattedStr = '{' + formattedStr + '}';

      // Parse the modified string to an object
      return JSON.parse(formattedStr);
    } catch (error) {
      console.error('Error parsing string to object:', error);
      return null;
    }
  };
}
