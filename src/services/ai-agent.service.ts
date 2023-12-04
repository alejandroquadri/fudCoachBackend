import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import {
  AIMessage,
  AgentStep,
  BaseMessage,
  FunctionMessage,
} from 'langchain/schema';
import { RunnableSequence } from 'langchain/schema/runnable';
import { SerpAPI, formatToOpenAIFunction } from 'langchain/tools';
import { Calculator } from 'langchain/tools/calculator';
import { OpenAIFunctionsAgentOutputParser } from 'langchain/agents/openai/output_parser';
import { BufferMemory } from 'langchain/memory';

import { pull } from 'langchain/hub';
import { PromptTemplate } from 'langchain/prompts';
import { formatLogToString } from 'langchain/agents/format_scratchpad/log';
import { renderTextDescription } from 'langchain/tools/render';
import { ReActSingleInputOutputParser } from 'langchain/agents/react/output_parser';

import { initializeAgentExecutorWithOptions } from 'langchain/agents';

export class AiAgent {
  constructor() {}

  buildInitAgentEx = async () => {
    // process.env.LANGCHAIN_HANDLER = 'langchain';
    const model = new ChatOpenAI({ temperature: 0, maxTokens: 25 });
    const tools = [
      new SerpAPI(process.env.SERPAPI_API_KEY, {
        location: 'Austin,Texas,United States',
        hl: 'en',
        gl: 'us',
      }),
      new Calculator(),
    ];

    // Passing "chat-conversational-react-description" as the agent type
    // automatically creates and uses BufferMemory with the executor.
    // If you would like to override this, you can pass in a custom
    // memory option, but the memoryKey set on it must be "chat_history".
    const executor = await initializeAgentExecutorWithOptions(tools, model, {
      agentType: 'chat-conversational-react-description',
      agentArgs: {
        systemMessage: `
        You are simulating the role of a top dietitian. Your primary function is to provide general guidance on nutrition, diet plans, wellness, exercise, and health. Respond in the language used in the user's query, but use English for processing and intermediate steps.

        Though users are informed to seek professional advice for their specific health needs, you may occasionally remind them that your guidance is general and not a substitute for personalized medical advice.
        
        Maintain a positive and supportive tone in your responses. Engage with users about their lifestyle in the context of nutrition and health. If questions fall outside your scope of nutrition, health, and wellness, politely inform the user that you can only address topics within these areas. 
        `,
      },
      verbose: false,
    });
    console.log('Loaded agent.');

    const input0 = 'hi, i am Alex. I am 40 years old';

    const result0 = await executor.invoke({ input: input0 });

    console.log(`Got output ${result0.output}`);

    const input1 = 'whats my name?';

    const result1 = await executor.invoke({ input: input1 });

    console.log(`Got output ${result1.output}`);

    const input2 = 'whats the weather in Buenos Aires, Argentina?';

    const result2 = await executor.invoke({ input: input2 });
    console.log(`Got output ${result2.output}`);

    const input3 = 'Based on your previous answer. Will I need a coat?';

    const result3 = await executor.invoke({ input: input3 });

    console.log(`Got output ${result3.output}`);

    return {
      executor,
      result0,
      result1,
      // result2,
      result3,
    };
  };

  buildChatAgentLCEL = async () => {
    console.time('Total Function Execution Time');
    console.time('agent load');
    /** Define your chat model */
    const model = new ChatOpenAI({ modelName: 'gpt-4' });
    /** Bind a stop token to the model */
    const modelWithStop = model.bind({
      stop: ['\nObservation'],
    });
    /** Define your list of tools */
    const tools = [
      new SerpAPI(process.env.SERPAPI_API_KEY, {
        location: 'Austin,Texas,United States',
        hl: 'en',
        gl: 'us',
      }),
      new Calculator(),
    ];
    /**
     * Pull a prompt from LangChain Hub
     * @link https://smith.langchain.com/hub/hwchase17/react-chat
     */
    const prompt = await pull<PromptTemplate>('hwchase17/react-chat');
    console.log(prompt);

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
    /**
     * Define your memory store
     * @important The memoryKey must be "chat_history" for the chat agent to work
     * because this is the key this particular prompt expects.
     */
    const memory = new BufferMemory({ memoryKey: 'chat_history' });
    /** Define your executor and pass in the agent, tools and memory */
    const executor = AgentExecutor.fromAgentAndTools({
      agent: runnableAgent,
      tools,
      memory,
    });

    console.log('Loaded agent.');
    console.timeEnd('agent load');

    console.time('question1');
    const input0 =
      'hi, my name is alex. I am 40 years old. My favorite game is Chess';
    const result0 = await executor.invoke({ input: input0 });
    console.log(`Got output: ${result0.output}`);
    console.timeEnd('question1');

    console.time('question2');

    const input1 = 'whats my name?';
    const result1 = await executor.invoke({ input: input1 });
    console.log(`Got output: ${result1.output}`);
    console.timeEnd('question2');

    console.time('question3');

    const input2 =
      'where can I find a cafe where I can practice my favorite game in new york?';
    const result2 = await executor.invoke({ input: input2 });
    console.log(`Got output: ${result2.output}`);
    console.timeEnd('question3');

    // const stream = await executor.stream({ input: input2 });

    // for await (const chunk of stream) {
    //   console.log(chunk);
    // }

    console.timeEnd('Total Function Execution Time');

    return {
      prompt,
      result0,
      result1,
      result2,
    };
  };

  buildAgent1 = async (query?: string) => {
    try {
      /** Define your list of tools. */
      const tools = [new Calculator(), new SerpAPI()];
      /**
       * Define your chat model to use.
       * In this example we'll use gpt-4 as it is much better
       * at following directions in an agent than other models.
       */
      const model = new ChatOpenAI({ modelName: 'gpt-4', temperature: 0 });

      /**
       * Add this for memmory
       */

      const memory = new BufferMemory({
        memoryKey: 'history', // The object key to store the memory under
        inputKey: 'question', // The object key for the input
        outputKey: 'answer', // The object key for the output
        returnMessages: true,
      });

      /**
       * Define your prompt for the agent to follow
       * Here we're using `MessagesPlaceholder` to contain our agent scratchpad
       * This is important as later we'll use a util function which formats the agent
       * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
       */
      const prompt = ChatPromptTemplate.fromMessages([
        ['ai', 'You are a helpful assistant'],
        ['human', '{input}'],
        new MessagesPlaceholder('agent_scratchpad'),
        new MessagesPlaceholder('chat_history'),
      ]);
      /**
       * Bind the tools to the LLM.
       * Here we're using the `formatToOpenAIFunction` util function
       * to format our tools into the proper schema for OpenAI functions.
       */
      const modelWithFunctions = model.bind({
        functions: [...tools.map(tool => formatToOpenAIFunction(tool))],
      });
      /**
       * Define a new agent steps parser.
       */
      const formatAgentSteps = (steps: AgentStep[]): BaseMessage[] =>
        steps.flatMap(({ action, observation }) => {
          if ('messageLog' in action && action.messageLog !== undefined) {
            const log = action.messageLog as BaseMessage[];
            return log.concat(new FunctionMessage(observation, action.tool));
          } else {
            return [new AIMessage(action.log)];
          }
        });
      /**
       * Construct the runnable agent.
       *
       * We're using a `RunnableSequence` which takes two inputs:
       * - input --> the users input
       * - agent_scratchpad --> the previous agent steps
       *
       * We're using the `formatForOpenAIFunctions` util function to format the agent
       * steps into a list of `BaseMessages` which can be passed into `MessagesPlaceholder`
       */
      const runnableAgent = RunnableSequence.from([
        {
          input: (i: { input: string; steps: AgentStep[] }) => i.input,
          agent_scratchpad: (i: { input: string; steps: AgentStep[] }) =>
            formatAgentSteps(i.steps),
          // Load memory here
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          chat_history: async (_: { input: string; steps: AgentStep[] }) => {
            const { history } = await memory.loadMemoryVariables({});
            return history;
          },
        },
        prompt,
        modelWithFunctions,
        new OpenAIFunctionsAgentOutputParser(),
      ]);
      /** Pass the runnable along with the tools to create the Agent Executor */
      const executor = AgentExecutor.fromAgentAndTools({
        agent: runnableAgent,
        tools,
      });

      console.log('Loaded agent executor');
      if (!query) {
        query =
          // 'What is the weather in New York? Give my the temperature in Celcius';
          'Hi! My name is Alex. I have 40 yers old and live in Buenos Aires. I like soccer and sports in general';
      }
      console.log(`Calling agent executor with query: ${query}`);
      const result = await executor.invoke({
        input: query,
      });
      console.log(result);
      /*
      Loaded agent executor
      Calling agent executor with query: What is the weather in New York?
      {
        output: 'The current weather in New York is sunny with a temperature of 66 degrees Fahrenheit. The humidity is at 54% and the wind is blowing at 6 mph. There is 0% chance of precipitation.'
      }
    */

      await memory.saveContext(
        {
          question: query,
        },
        {
          answer: result.output,
        }
      );

      console.log(memory.chatHistory);

      // const query2 = 'Do I need a jacket?';
      const query2 = 'Do you remember my name?';
      const result2 = await executor.invoke({
        input: query2,
      });
      console.log(result2);
      return {
        result,
        result2,
      };
    } catch (error) {
      console.log('hubo un error', error);
    }
  };
}
