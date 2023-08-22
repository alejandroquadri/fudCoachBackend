/* eslint-disable @typescript-eslint/no-var-requires */
import express, { Router, Request, Response } from 'express';

// import { OpenAI } from 'langchain/llms/openai';
const { OpenAI } = require('langchain/llms/openai');
const { PromptTemplate } = require('langchain/prompts');
const { LLMChain, ConversationChain } = require('langchain/chains');
const { SerpAPI } = require('langchain/tools');
const { Calculator } = require('langchain/tools/calculator');
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { BufferMemory } = require('langchain/memory');
const { ChatOpenAI } = require('langchain/chat_models/openai');

export class LangChTest {
  private router: Router = express.Router();
  apiChainModule: any;

  constructor() {
    this.initializeRoutes();
    // this.chatAgent();
  }

  private initializeRoutes(): void {
    this.router.get('/', this.aiRouteTest);
    this.router.get('/aiTest', this.aiTest);
    this.router.get('/chain/:product', this.chainTest);
    this.router.get('/agentTest', this.agentTest);
    this.router.get('/memoryTest', this.memoryTest);
    this.router.get('/streaming', this.streamingTest);
  }

  public getRouter(): Router {
    return this.router;
  }

  private aiRouteTest(req: Request, res: Response): void {
    res.send('Ai working well');
  }

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

  async chatAgent() {
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
