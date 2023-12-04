import {
  AgentExecutor,
  initializeAgentExecutorWithOptions,
} from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import {
  BufferMemory,
  ChatMessageHistory,
  ConversationSummaryBufferMemory,
} from 'langchain/memory';
import {
  AIMessage,
  AgentStep,
  BaseMessage,
  HumanMessage,
} from 'langchain/schema';
import { DynamicTool } from 'langchain/tools';
import { MongoDBChatMessageHistory } from 'langchain/stores/message/mongodb';

import { AiChatAnswer, ChatMsg } from '../types';
import { AiModel } from '../models';
import { mongoInstance } from '../connection';

import { ChatPromptTemplate } from 'langchain/prompts';
import { renderTextDescription } from 'langchain/tools/render';

import { CoachPrompt, FoodToolPrompt } from './prompt.constant';
import { formatLogToString } from 'langchain/agents/format_scratchpad/log';
import { ReActSingleInputOutputParser } from 'langchain/agents/react/output_parser';
import { RunnableSequence } from 'langchain/schema/runnable';

export class AiService {
  aiModel: AiModel;
  model: ChatOpenAI = new ChatOpenAI({
    // modelName: 'gpt-4',
    modelName: 'gpt-3.5-turbo',
    temperature: 0,
    // verbose: true,
  });

  coachPrompt = CoachPrompt;
  foodToolPrompt = FoodToolPrompt;

  constructor() {
    this.aiModel = new AiModel();
  }

  getChatPromptMemory = (
    history?: ChatMessageHistory
  ): ConversationSummaryBufferMemory => {
    return new ConversationSummaryBufferMemory({
      llm: new ChatOpenAI({
        modelName: 'gpt-3.5-turbo',
        temperature: 0,
      }),
      // llm: this.model,
      maxTokenLimit: 10,
      returnMessages: true,
      chatHistory: history,
      memoryKey: 'chat_history',
      outputKey: 'output',
    });
  };

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

    const tools = [this.wheightTool(userId)];

    const executor = await initializeAgentExecutorWithOptions(
      tools,
      this.model,
      {
        agentType: 'chat-conversational-react-description',
        // agentType: 'openai-functions',
        memory: agentChatPromptMemory,
        returnIntermediateSteps: true,
        agentArgs: {
          systemMessage: this.coachPrompt,
        },
      }
    );
    // const answer = await executor.call({ input: message });
    const answer = await executor.invoke({ input: message });
    await mongoChatHistory.addMessage(new HumanMessage(message));
    await mongoChatHistory.addMessage(new AIMessage(answer.output));
    console.log('respuesta del ai desde ai service:', answer);
    return answer as Promise<AiChatAnswer>;
  };

  getCustomAiResponse = async (
    message: string,
    userId: string
  ): Promise<any> => {
    console.log('comienza getCustomAiResponse');
    console.time('Total Function Execution Time');
    console.time('agent load');
    /** Define your chat model */
    const model = new ChatOpenAI({
      modelName: 'gpt-4',
      verbose: false,
    });

    /** Bind a stop token to the model */
    const modelWithStop = model.bind({
      stop: ['\nObservation'],
    });

    /** Define your list of tools */
    const tools = [this.wheightTool(userId), this.foodLogTool(userId)];

    // define prompt
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.coachPrompt],
    ]);

    /** Add input variables to prompt */
    const toolNames = tools.map(tool => tool.name);
    const promptWithInputs = await prompt.partial({
      tools: renderTextDescription(tools),
      tool_names: toolNames.join(','),
    });

    const runnableAgent = RunnableSequence.from([
      {
        input: (i: {
          input: string;
          steps: AgentStep[];
          chat_history: BaseMessage[];
        }) => i.input,
        agent_scratchpad: (i: {
          input: string;
          steps: AgentStep[];
          chat_history: BaseMessage[];
        }) => formatLogToString(i.steps),
        chat_history: (i: {
          input: string;
          steps: AgentStep[];
          chat_history: BaseMessage[];
        }) => i.chat_history,
      },
      promptWithInputs,
      modelWithStop,
      new ReActSingleInputOutputParser({ toolNames }),
    ]);

    /* time here */
    console.time('load messages');
    const chatHistoryCollection = mongoInstance.db.collection('chatHistory');
    const mongoChatHistory = new MongoDBChatMessageHistory({
      collection: chatHistoryCollection,
      sessionId: userId,
    });
    const existingHistory = await mongoChatHistory.getMessages();
    // const agentChatPromptMemory = this.getChatPromptMemory(
    //   new ChatMessageHistory(existingHistory)
    // );

    const memory = new BufferMemory({
      memoryKey: 'chat_history',
      chatHistory: new ChatMessageHistory(existingHistory),
    });
    console.timeEnd('load messages');

    const executor = AgentExecutor.fromAgentAndTools({
      agent: runnableAgent,
      tools,
      // memory: agentChatPromptMemory,
      memory,
    });

    console.log('Loaded agent.');
    console.timeEnd('agent load');

    /* => time here */
    console.time('ai response');
    const answer = await executor.invoke({ input: message });
    // const answer = { output: 'mensaje prueba' };
    console.log(`Got output ${answer.output}`);

    // const stream = await executor.stream({ input: message });
    // for await (const chunk of stream) {
    //   console.log(chunk);
    // }

    console.timeEnd('ai response');

    /* => time here */
    console.time('save new mess');
    await mongoChatHistory.addMessage(new HumanMessage(message));
    await mongoChatHistory.addMessage(new AIMessage(answer.output));
    console.timeEnd('save new mess');

    /* time here */
    console.timeEnd('Total Function Execution Time');

    return answer as AiChatAnswer;
  };

  wheightTool = (id: string) =>
    new DynamicTool({
      name: 'Weight_Logs',
      description:
        'call this each time the user provides a new weight log. The input should be the number in kg of the new weight log',
      func: async w => {
        try {
          console.log(w);
          const weight = Number(w);
          const res = await this.aiModel.saveWeightLog(id, weight);
          console.log('peso guardado', res);
          return 'Weigh was logged';
        } catch (error) {
          return 'There was an error logging your new weight log';
        }
      },
    });

  foodLogTool = (id: string) =>
    new DynamicTool({
      name: 'Food_Logs',
      description: this.foodToolPrompt,
      func: async (obj: string) => {
        console.log(`inputs de funcion`, obj);
        try {
          await this.aiModel.saveFoodLog(id, obj);
          console.log('food log saved');
          return `Food log saved! ${obj}`;
        } catch (error) {
          return `error trying to save log: ${error}`;
        }
      },
    });
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
