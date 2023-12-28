import {
  BufferMemory,
  ChatMessageHistory,
  ConversationSummaryBufferMemory,
} from 'langchain/memory';

import { MongoDBChatMessageHistory } from 'langchain/stores/message/mongodb';
import { AIMessage, BaseMessage, HumanMessage } from 'langchain/schema';

import { mongoInstance } from '../connection';
import { ChatOpenAI } from 'langchain/chat_models/openai';

export class AiMemoryService {
  buildMemory = async (mongoHistory: MongoDBChatMessageHistory) => {
    const existingHistory = await mongoHistory.getMessages();

    return new BufferMemory({
      memoryKey: 'chat_history',
      chatHistory: new ChatMessageHistory(existingHistory),
    });
  };

  buildMongoHistory = (userId: string) => {
    const chatHistoryCollection = mongoInstance.db.collection('chatHistory');
    return new MongoDBChatMessageHistory({
      collection: chatHistoryCollection,
      sessionId: userId,
    });
  };

  saveNewHumanMsg = (
    mongoChatHistory: MongoDBChatMessageHistory,
    message: string
  ) => {
    return mongoChatHistory.addMessage(new HumanMessage(message));
  };

  saveNewAiMsg = (
    mongoChatHistory: MongoDBChatMessageHistory,
    message: string
  ) => {
    return mongoChatHistory.addMessage(new AIMessage(message));
  };

  /* !!! Esta funcion sirve para usar el tipo de conversacion donde el ai resume la conversacion.
  En principio esta buena la idea porque manda menos tokens. El problema es que de esta forma la respuesta
  es super lenta */
  getChatPromptMemory = (
    existingHistory?: BaseMessage[] | undefined
  ): ConversationSummaryBufferMemory => {
    return new ConversationSummaryBufferMemory({
      llm: new ChatOpenAI({
        modelName: 'gpt-3.5-turbo',
        temperature: 0.5,
      }),
      maxTokenLimit: 10,
      returnMessages: true,
      chatHistory: new ChatMessageHistory(existingHistory),
      memoryKey: 'chat_history',
      outputKey: 'output',
    });
  };
}
