import { ChatOpenAI } from 'langchain/chat_models/openai';
import {
  CoachPrompt,
  FoodToolPrompt,
  IntroCoachPrompt,
} from './prompt.constant';
import { AiChatAnswer } from '../../types';
import { AiModel } from '../../models';
import { ToolsService } from './ai-tools.service';
import { AiAgentService } from './ai-agent.service';
import { AiMemoryService } from './ai-memory.service';

export class AiService {
  aiModel: AiModel;
  toolsSc: ToolsService;
  agentSc: AiAgentService;
  aiMemorySc: AiMemoryService;

  coachPrompt = CoachPrompt;
  introCoach = IntroCoachPrompt;
  foodToolPrompt = FoodToolPrompt;

  constructor() {
    this.aiModel = new AiModel();
    this.toolsSc = new ToolsService();
    this.agentSc = new AiAgentService();
    this.aiMemorySc = new AiMemoryService();
  }

  getAiResponse = async (
    message: string,
    userId: string
  ): Promise<AiChatAnswer> => {
    const model = new ChatOpenAI({
      // modelName: 'gpt-4',
      // modelName: 'gpt-3.5-turbo',
      modelName: 'gpt-4o-mini',
      temperature: 0.5,
      verbose: false,
    });

    const tools = [
      this.toolsSc.wheightTool(userId),
      this.toolsSc.foodLogTool(userId),
      this.toolsSc.nickNameSaveTool(userId),
    ];

    const mongoHistory = this.aiMemorySc.buildMongoHistory(userId);
    const memory = await this.aiMemorySc.buildMemory(mongoHistory);

    const executor = await this.agentSc.buildAgent(
      model,
      this.coachPrompt,
      tools,
      memory
    );

    const answer = await executor.invoke({ input: message });
    console.log(`Got output ${answer.output}`);

    await this.aiMemorySc.saveNewHumanMsg(mongoHistory, message);

    await this.aiMemorySc.saveNewAiMsg(mongoHistory, answer.output);

    return answer as AiChatAnswer;
  };

  getAiIntroResponse = async (
    message: string,
    userId: string
  ): Promise<AiChatAnswer> => {
    const model = new ChatOpenAI({
      modelName: 'gpt-4',
      // modelName: 'gpt-3.5-turbo',
      temperature: 0.5,
      verbose: false,
    });

    const tools = [
      this.toolsSc.wheightTool(userId),
      this.toolsSc.nickNameSaveTool(userId),
      this.toolsSc.birthdaySaveTool(userId),
      this.toolsSc.genderSaveTool(userId),
      this.toolsSc.qAndASaveTool(userId),
      this.toolsSc.endQASaveTool(userId),
    ];

    const mongoHistory = this.aiMemorySc.buildMongoHistory(userId);
    const memory = await this.aiMemorySc.buildMemory(mongoHistory);

    const executor = await this.agentSc.buildAgent(
      model,
      this.introCoach,
      tools,
      memory
    );

    const answer = await executor.invoke({ input: message });
    console.log(`Got output ${answer}`);

    await this.aiMemorySc.saveNewHumanMsg(mongoHistory, message);
    await this.aiMemorySc.saveNewAiMsg(mongoHistory, answer.output);

    return answer as AiChatAnswer;
  };

  // getAiResponseOld = async (message: string, userId: string): Promise<any> => {
  //   console.time('Total Function Execution Time');

  //   /** Define your chat model */
  //   const model = new ChatOpenAI({
  //     modelName: 'gpt-4',
  //     // modelName: 'gpt-3.5-turbo',
  //     temperature: 0.5,
  //     verbose: false,
  //   });

  //   /** Bind a stop token to the model */
  //   const modelWithStop = model.bind({
  //     stop: ['\nObservation'],
  //   });

  //   /** Define your list of tools */
  //   // const tools = [this.wheightTool(userId), this.foodLogTool(userId)];
  //   const tools = [
  //     this.toolsSc.wheightTool(userId),
  //     this.toolsSc.foodLogTool(userId),
  //   ];

  //   // define prompt
  //   const prompt = ChatPromptTemplate.fromMessages([
  //     ['system', this.coachPrompt],
  //   ]);

  //   /** Add input variables to prompt */
  //   const toolNames = tools.map(tool => tool.name);
  //   const promptWithInputs = await prompt.partial({
  //     tools: renderTextDescription(tools),
  //     tool_names: toolNames.join(','),
  //   });
  //   const runnableAgent = RunnableSequence.from([
  //     {
  //       input: (i: {
  //         input: string;
  //         steps: AgentStep[];
  //         chat_history: BaseMessage[];
  //       }) => i.input,
  //       agent_scratchpad: (i: {
  //         input: string;
  //         steps: AgentStep[];
  //         chat_history: BaseMessage[];
  //       }) => formatLogToString(i.steps),
  //       chat_history: (i: {
  //         input: string;
  //         steps: AgentStep[];
  //         chat_history: BaseMessage[];
  //       }) => i.chat_history,
  //     },
  //     promptWithInputs,
  //     modelWithStop,
  //     new ReActSingleInputOutputParser({ toolNames }),
  //   ]);

  //   /* time here */
  //   const chatHistoryCollection = mongoInstance.db.collection('chatHistory');
  //   const mongoChatHistory = new MongoDBChatMessageHistory({
  //     collection: chatHistoryCollection,
  //     sessionId: userId,
  //   });
  //   const existingHistory = await mongoChatHistory.getMessages();

  //   const memory = new BufferMemory({
  //     memoryKey: 'chat_history',
  //     chatHistory: new ChatMessageHistory(existingHistory),
  //   });

  //   const executor = AgentExecutor.fromAgentAndTools({
  //     agent: runnableAgent,
  //     tools,
  //     memory,
  //   });
  //   const answer = await executor.invoke({ input: message });
  //   console.log(`Got output ${answer.output}`);

  //   // guardo mensajes en la historia
  //   await mongoChatHistory.addMessage(new HumanMessage(message));
  //   await mongoChatHistory.addMessage(new AIMessage(answer.output));

  //   console.timeEnd('Total Function Execution Time');

  //   return answer as AiChatAnswer;
  // };

  // wheightTool = (id: string) =>
  //   new DynamicTool({
  //     name: 'Weight_Logs',
  //     description:
  //       'call this each time the user provides a new weight log. The input should be the number in kg of the new weight log',
  //     func: async w => {
  //       try {
  //         console.log(w);
  //         const weight = Number(w);
  //         const res = await this.aiModel.saveWeightLog(id, weight);
  //         console.log('peso guardado', res);
  //         return 'Weigh was logged';
  //       } catch (error) {
  //         return 'There was an error logging your new weight log';
  //       }
  //     },
  //   });

  // foodLogTool = (id: string) =>
  //   new DynamicTool({
  //     name: 'Food_Logs',
  //     description: this.foodToolPrompt,
  //     func: async (obj: string) => {
  //       console.log(`inputs de funcion`, obj);
  //       try {
  //         await this.aiModel.saveFoodLog(id, obj);
  //         console.log('food log saved');
  //         return `Food log saved! ${obj}`;
  //       } catch (error) {
  //         return `error trying to save log: ${error}`;
  //       }
  //     },
  //   });
}

// getAiResponse = async (
//   message: string,
//   userId: string
// ): Promise<AiChatAnswer> => {
//   const chatHistoryCollection = mongoInstance.db.collection('chatHistory');
//   const mongoChatHistory = new MongoDBChatMessageHistory({
//     collection: chatHistoryCollection,
//     sessionId: userId,
//   });
//   const existingHistory = await mongoChatHistory.getMessages();
//   const agentChatPromptMemory = this.getChatPromptMemory(
//     new ChatMessageHistory(existingHistory)
//   );

//   const tools = [this.wheightTool(userId)];

//   const executor = await initializeAgentExecutorWithOptions(
//     tools,
//     this.model,
//     {
//       agentType: 'chat-conversational-react-description',
//       // agentType: 'openai-functions',
//       memory: agentChatPromptMemory,
//       returnIntermediateSteps: true,
//       agentArgs: {
//         systemMessage: this.coachPrompt,
//       },
//     }
//   );
//   // const answer = await executor.call({ input: message });
//   const answer = await executor.invoke({ input: message });
//   await mongoChatHistory.addMessage(new HumanMessage(message));
//   await mongoChatHistory.addMessage(new AIMessage(answer.output));
//   console.log('respuesta del ai desde ai service:', answer);
//   return answer as Promise<AiChatAnswer>;
// };

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
