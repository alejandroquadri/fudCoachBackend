import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import {
  ChatMessageHistory,
  ConversationSummaryBufferMemory,
} from 'langchain/memory';
import { AIMessage, HumanMessage } from 'langchain/schema';
import { DynamicTool } from 'langchain/tools';

import { ChatMsg } from '../types';

export class AiService {
  model: ChatOpenAI = new ChatOpenAI({
    modelName: 'gpt-4',
    // modelName: 'gpt-3.5-turbo',
    temperature: 0.9,
    // verbose: true,
  });

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
      if (msg.type === 'ai') {
        history.push(new AIMessage(msg.content));
      }
      if (msg.type === 'user') {
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

  getAiResponse = async (message: string, history?: Array<ChatMsg>) => {
    let chatHistory;
    if (history) {
      const previousMessages = this.buildChatHistory(history);
      chatHistory = new ChatMessageHistory(previousMessages);
    }

    const agentChatPromptMemory = this.getChatPromptMemory(chatHistory);

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
    console.log(answer);
    return answer;
  };
}

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
