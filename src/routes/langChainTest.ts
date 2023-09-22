import express, { Router, Request, Response } from 'express';

import { OpenAI } from 'langchain/llms/openai';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
  SystemMessagePromptTemplate,
} from 'langchain/prompts';
import { LLMChain, ConversationChain } from 'langchain/chains';
import { DynamicTool, SerpAPI } from 'langchain/tools';
import { Calculator } from 'langchain/tools/calculator';
import { initializeAgentExecutorWithOptions } from 'langchain/agents';
import { BufferMemory, ChatMessageHistory } from 'langchain/memory';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { ConversationSummaryBufferMemory } from 'langchain/memory';
import { AIMessage, HumanMessage } from 'langchain/schema';

export class LangChTest {
  private router: Router = express.Router();
  apiChainModule: any;

  private model: ChatOpenAI = new ChatOpenAI({
    modelName: 'gpt-4',
    // modelName: 'gpt-3.5-turbo',
    temperature: 0.9,
    // verbose: true,
  });

  private chatPromptMemory: ConversationSummaryBufferMemory =
    new ConversationSummaryBufferMemory({
      llm: this.model,
      maxTokenLimit: 10,
      returnMessages: true,
    });

  private agentChatPromptMemory: ConversationSummaryBufferMemory =
    new ConversationSummaryBufferMemory({
      llm: this.model,
      maxTokenLimit: 10,
      returnMessages: true,
      memoryKey: 'chat_history',
      outputKey: 'output',
    });

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.aiRouteTest);
    this.router.get('/aiTest', this.aiTest);
    this.router.get('/chain/:product', this.chainTest);
    this.router.get('/agentTest', this.agentTest);
    this.router.get('/memoryTest', this.memoryTest);
    this.router.get('/streaming', this.streamingTest);
    this.router.post('/chatMem', this.chatMemExample);
    this.router.post('/chat', this.chat);
    this.router.post('/chatAgent', this.chatAgent);
    this.router.post('/customChatAgent', this.customChatAgent);
  }

  public getRouter(): Router {
    return this.router;
  }

  private aiRouteTest(req: Request, res: Response): void {
    res.send('Ai working well');
  }

  private customChatAgent = async (req: Request, res: Response) => {
    const { message } = req.body;
    try {
      const previousMessages = [
        new HumanMessage('My name is Bob'),
        new AIMessage('Nice to meet you, Bob!'),
      ];

      const chatHistory = new ChatMessageHistory(previousMessages);
      this.agentChatPromptMemory.chatHistory = chatHistory;

      const tools = [
        new Calculator(),
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
        }),
      ];

      const executor = await initializeAgentExecutorWithOptions(
        tools,
        this.model,
        {
          agentType: 'openai-functions',
          memory: this.agentChatPromptMemory,
          returnIntermediateSteps: true,
          agentArgs: {
            prefix: `Do your best to answer the questions. Feel free to use any tools available to look up relevant information, only if necessary.`,
          },
        }
      );
      const answer = await executor.call({ input: message });
      console.log(answer);
      res.status(200).json({ answer });
    } catch (error) {
      console.log(error);
      res.status(500).send('Internal Server Error');
    }
  };

  private chatAgent = async (req: Request, res: Response) => {
    const { message } = req.body;
    try {
      if (!message && typeof message !== 'string') {
        throw new Error('message is not a string');
      }
      const tools = [new Calculator()];
      const executor = await initializeAgentExecutorWithOptions(
        tools,
        this.model,
        {
          agentType: 'chat-conversational-react-description',
          verbose: true,
          memory: this.agentChatPromptMemory,
        }
      );
      const answer = await executor.call({ input: message });
      console.log(answer);
      res.status(200).json({ answer });
    } catch (error) {
      console.log(error);
      res.status(500).send('Internal Server Error');
    }
  };

  private chat = async (req: Request, res: Response) => {
    const userMessage: string = req.body.message;
    console.log(userMessage);
    try {
      const chatPrompt = ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
          'The following is a friendly conversation between a human and an AI. The AI is talkative and provides lots of specific details from its context. If the AI does not know the answer to a question, it truthfully says it does not know.'
        ),
        new MessagesPlaceholder('history'),
        HumanMessagePromptTemplate.fromTemplate('{input}'),
      ]);
      const model = new ChatOpenAI({ temperature: 0.9, verbose: true });
      const chain = new ConversationChain({
        llm: model,
        memory: this.chatPromptMemory,
        prompt: chatPrompt,
      });

      const answer = await chain.predict({ input: userMessage });
      console.log({ answer });
      res.status(200).json({ answer });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error });
    }
  };

  private chatMemExample = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      // // summary buffer memory
      // const memory = new ConversationSummaryBufferMemory({
      //   llm: new OpenAI({ modelName: 'text-davinci-003', temperature: 0 }),
      //   maxTokenLimit: 10,
      // });

      // await memory.saveContext({ input: 'hi' }, { output: 'whats up' });
      // await memory.saveContext(
      //   { input: 'not much you' },
      //   { output: 'not much' }
      // );
      // const history = await memory.loadMemoryVariables({});
      // console.log({ history });
      // /*
      //   {
      //     history: {
      //       history: 'System: \n' +
      //         'The human greets the AI, to which the AI responds.\n' +
      //         'Human: not much you\n' +
      //         'AI: not much'
      //     }
      //   }
      // */

      // We can also get the history as a list of messages (this is useful if you are using this with a chat prompt).
      // const chatPromptMemory = new ConversationSummaryBufferMemory({
      //   llm: new ChatOpenAI({ modelName: 'gpt-3.5-turbo', temperature: 0 }),
      //   maxTokenLimit: 10,
      //   returnMessages: true,
      // });
      // await chatPromptMemory.saveContext(
      //   { input: 'hi' },
      //   { output: 'whats up' }
      // );
      // await chatPromptMemory.saveContext(
      //   { input: 'not much you' },
      //   { output: 'not much' }
      // );

      // We can also utilize the predict_new_summary method directly.
      const messages = await this.chatPromptMemory.chatHistory.getMessages();
      const previous_summary = '';
      const predictSummary = await this.chatPromptMemory.predictNewSummary(
        messages,
        previous_summary
      );
      console.log(JSON.stringify(predictSummary));

      // Using in a chain
      // Let's walk through an example, again setting verbose to true so we can see the prompt.
      const chatPrompt = ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
          'The following is a friendly conversation between a human and an AI. The AI is talkative and provides lots of specific details from its context. If the AI does not know the answer to a question, it truthfully says it does not know.'
        ),
        new MessagesPlaceholder('history'),
        HumanMessagePromptTemplate.fromTemplate('{input}'),
      ]);

      const model = new ChatOpenAI({ temperature: 0.9, verbose: true });
      const chain = new ConversationChain({
        llm: model,
        memory: this.chatPromptMemory,
        prompt: chatPrompt,
      });

      const res1 = await chain.predict({ input: "Hi, what's up?" });
      console.log({ res1 });
      /*
        {
          res1: 'Hello! I am an AI language model, always ready to have a conversation. How can I assist you today?'
        }
      */

      const res2 = await chain.predict({
        input: 'Just working on writing some documentation!',
      });
      console.log({ res2 });
      /*
        {
          res2: "That sounds productive! Documentation is an important aspect of many projects. Is there anything specific you need assistance with regarding your documentation? I'm here to help!"
        }
      */

      const res3 = await chain.predict({
        input: 'For LangChain! Have you heard of it?',
      });
      console.log({ res3 });
      /*
        {
          res3: 'Yes, I am familiar with LangChain! It is a blockchain-based language learning platform that aims to connect language learners with native speakers for real-time practice and feedback. It utilizes smart contracts to facilitate secure transactions and incentivize participation. Users can earn tokens by providing language learning services or consuming them for language lessons.'
        }
      */

      const res4 = await chain.predict({
        input:
          "That's not the right one, although a lot of people confuse it for that!",
      });
      console.log({ res4 });

      res.json({ reply: res4 });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: 'Failed to get a response from the model.' });
    }
  };

  // private chatRoute = async (req: Request, res: Response): Promise<void> => {
  //   const userMessage = req.body.message;

  //   const chatPrompt = ChatPromptTemplate.fromPromptMessages([
  //     SystemMessagePromptTemplate.fromTemplate(
  //       'The following is a friendly conversation between a human and an AI. The AI is talkative and provides lots of specific details from its context. If the AI does not know the answer to a question, it truthfully says it does not know.'
  //     ),
  //     new MessagesPlaceholder('history'),
  //     HumanMessagePromptTemplate.fromTemplate('{entrada}'),
  //   ]);

  //   const model = new ChatOpenAI({ temperature: 0.9 });
  //   const chain = new ConversationChain({
  //     llm: model,
  //     memory: this.chatSummaryMemory,
  //     prompt: chatPrompt,
  //   });

  //   try {
  //     const response = await chain.predict({ entrada: userMessage });
  //     this.chatSummaryMemory.saveContext(
  //       { entrada: userMessage },
  //       { output: response }
  //     );
  //     res.json({ reply: response });
  //   } catch (error) {
  //     console.log(error);
  //     res
  //       .status(500)
  //       .json({ error: 'Failed to get a response from the model.' });
  //   }
  // };

  // Rutas de prueba

  private async aiTest(req: Request, res: Response): Promise<void> {
    const model = new OpenAI({
      temperature: 0.9,
    });
    const answer = await model.call(
      'What would be a good company name a company that makes colorful socks?'
    );
    console.log(answer);
    res.send(answer);
  }

  private async chainTest(req: Request, res: Response) {
    const product = req.params.id;
    const model = new OpenAI({
      temperature: 0.9,
    });
    const template = 'What is a good name for a company that makes {product}?';
    const prompt = new PromptTemplate({
      template: template,
      inputVariables: ['product'],
    });
    const chain = new LLMChain({ llm: model, prompt: prompt });
    const answer = await chain.call({ product: product });
    console.log(answer);
    res.send(answer.text);
  }

  private async agentTest(req: Request, res: Response) {
    const model = new OpenAI({ temperature: 0 });
    const tools = [
      new SerpAPI(process.env.SERPAPI_API_KEY, {
        location: 'Austin,Texas,United States',
        hl: 'en',
        gl: 'us',
      }),
      new Calculator(),
    ];

    const executor = await initializeAgentExecutorWithOptions(tools, model, {
      agentType: 'zero-shot-react-description',
      verbose: true,
    });
    console.log('Loaded agent.');

    const input =
      'Who is the economy minister in Argentina?' +
      'What is his current age raised to the 0.23 power?';
    console.log(`Executing with input "${input}"...`);

    const result = await executor.call({ input });

    console.log(`Got output ${result.output}`);
    res.send(`Got output ${result.output}`);
  }

  private async memoryTest(req: Request, res: Response) {
    const model = new OpenAI({});
    const memory = new BufferMemory();
    const chain = new ConversationChain({ llm: model, memory: memory });
    const res1 = await chain.call({ input: "Hi! I'm Jim." });
    console.log(res1);
    const res2 = await chain.call({ input: "What's my name?" });
    console.log(res2);
    res.send('done');
  }

  private async streamingTest(req: Request, res: Response) {
    const chat = new OpenAI({
      streaming: true,
      callbacks: [
        {
          handleLLMNewToken(token: string) {
            process.stdout.write(token);
          },
        },
      ],
    });

    await chat.call('Write me a song about sparkling water.');
    res.send('done streaming');
  }

  async chatAgentExample() {
    const model = new ChatOpenAI({ temperature: 0 });
    const tools = [
      new SerpAPI(process.env.SERPAPI_API_KEY, {
        location: 'Buenos Aires, Argentina',
        hl: 'es',
        gl: 'ar',
      }),
      new Calculator(),
    ];

    const executor = await initializeAgentExecutorWithOptions(tools, model, {
      agentType: 'chat-zero-shot-react-description',
      verbose: true,
      returnIntermediateSteps: true,
    });
    console.log('Loaded agent.');

    const input = `Dame la informacion nutricional detallada de un turron de arcor. Estoy buscando calorías, macronutrientes, carbohidratos, grasas.`;

    // console.log(`Executing with input "${input}"...`);

    const result = await executor.call({ input });

    // console.log(`Got output ${result.output}`);

    // console.log(
    //   `Got intermediate steps ${JSON.stringify(
    //     result.intermediateSteps,
    //     null,
    //     2
    //   )}`
    // );
  }
}
