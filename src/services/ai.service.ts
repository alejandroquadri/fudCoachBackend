import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import {
  ChatMessageHistory,
  ConversationSummaryBufferMemory,
} from 'langchain/memory';
import { AIMessage, HumanMessage } from 'langchain/schema';
import { DynamicTool } from 'langchain/tools';
import { MongoDBChatMessageHistory } from 'langchain/stores/message/mongodb';

import { AiChatAnswer, ChatMsg } from '../types';
import { AiModel } from '../models';
import { mongoInstance } from '../connection';

export class AiService {
  aiModel: AiModel;
  model: ChatOpenAI = new ChatOpenAI({
    modelName: 'gpt-4',
    // modelName: 'gpt-3.5-turbo',
    temperature: 0.9,
    // verbose: true,
  });

  constructor() {
    this.aiModel = new AiModel();
  }

  getChatPromptMemory = (
    history?: ChatMessageHistory
  ): ConversationSummaryBufferMemory => {
    return new ConversationSummaryBufferMemory({
      llm: this.model,
      maxTokenLimit: 10,
      returnMessages: true,
      chatHistory: history,
      memoryKey: 'chat_history',
      outputKey: 'output',
    });
  };

  buildChatHistory = (
    messages: Array<ChatMsg>
  ): (HumanMessage | AIMessage)[] => {
    const history: (HumanMessage | AIMessage)[] = [];
    messages.forEach(msg => {
      if (msg.sender === 'ai') {
        history.push(new AIMessage(msg.content));
      }
      if (msg.sender === 'user') {
        history.push(new HumanMessage(msg.content));
      }
    });
    return history;
  };

  wheightTool = () =>
    new DynamicTool({
      name: 'WeightLogs',
      description:
        'call this each time the user provides a new weight log. The input should be the number in kg of the new weight log',
      func: async w => {
        try {
          console.log(w);
          return 'Weigh was logged';
        } catch (error) {
          return 'There was an error logging your new weight log';
        }
      },
    });

  getAiResponse = async (
    message: string,
    userId: string
  ): Promise<AiChatAnswer> => {
    const chatHistoryCollection = mongoInstance.db.collection('chatHistory');
    const mongoChatHistory = new MongoDBChatMessageHistory({
      collection: chatHistoryCollection,
      sessionId: userId,
    });
    const existingHistory = await mongoChatHistory.getMessages();
    const agentChatPromptMemory = this.getChatPromptMemory(
      new ChatMessageHistory(existingHistory)
    );

    const tools = [this.wheightTool()];

    const executor = await initializeAgentExecutorWithOptions(
      tools,
      this.model,
      {
        agentType: 'openai-functions',
        memory: agentChatPromptMemory,
        returnIntermediateSteps: true,
        agentArgs: {
          prefix: `Do your best to answer the questions. Feel free to use any tools available to look up relevant information, only if necessary.`,
        },
      }
    );
    const answer = await executor.call({ input: message });
    await mongoChatHistory.addMessage(new HumanMessage(message));
    await mongoChatHistory.addMessage(new AIMessage(answer.output));
    console.log('respuesta del ai desde ai service:', answer);
    return answer as Promise<AiChatAnswer>;
  };
}

// getAiResponse = async (
//   message: string,
//   history?: Array<ChatMsg>
// ): Promise<AiChatAnswer> => {
//   let chatHistory;
//   if (history) {
//     const previousMessages = this.buildChatHistory(history);
//     console.log('convertido para history', previousMessages);
//     chatHistory = new ChatMessageHistory(previousMessages);
//   }
//   console.log('esto meto', chatHistory);
//   const agentChatPromptMemory = this.getChatPromptMemory(chatHistory);

//   const tools = [this.wheightTool()];

//   const executor = await initializeAgentExecutorWithOptions(
//     tools,
//     this.model,
//     {
//       agentType: 'openai-functions',
//       memory: agentChatPromptMemory,
//       returnIntermediateSteps: true,
//       agentArgs: {
//         prefix: `Do your best to answer the questions. Feel free to use any tools available to look up relevant information, only if necessary.`,
//       },
//     }
//   );
//   const answer = await executor.call({ input: message });
//   console.log('respuesta del ai desde ai service:', answer);
//   return answer as Promise<AiChatAnswer>;
// };

// saveChatHistory = async (history: any, id: string) => {
//   serialijse.declarePersistable(history);
//   const historyJson: string = serialijse.serialize(history);
//   console.log('termine de serializarahora guardo');
//   return this.aiModel.saveChatHistory(historyJson, id);
// };

// getChatHistory = async (id: string) => {
//   return this.aiModel.getChatHistory(id);
// };

// Op 1 para guardar mensajes en memoria

// const previousMessages = [
//   new HumanMessage('Ho'),
//   new AIMessage('whats up!'),
//   new HumanMessage('My name is Alex'),
//   new AIMessage('Nice to meet you!'),
// ];

// Op 2 para guardar mensajes en memoria

// await agentChatPromptMemory.saveContext(
//   { input: 'hi' },
//   { output: 'whats up' }
// );
// console.log('saved mes 1');
// await agentChatPromptMemory.saveContext(
//   { input: 'My name is Alex' },
//   { output: 'Nice to meet you!' }
// );
// console.log('saved mes 2');

// // !! Opcion 1 para ver memoria
// const history = await agentChatPromptMemory.loadMemoryVariables({});
// console.log(JSON.stringify(history));

// // !!Opcion 2 para ver memoria

// const messages = await agentChatPromptMemory.chatHistory.getMessages();
// const previous_summary = '';
// const predictSummary = await agentChatPromptMemory.predictNewSummary(
//   messages,
//   previous_summary
// );
// console.log(JSON.stringify(predictSummary));

// console.log(JSON.stringify(agentChatPromptMemory));
