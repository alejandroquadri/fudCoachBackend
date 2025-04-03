import { DynamicTool } from 'langchain/tools';
import { AgentExecutor } from 'langchain/agents';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { BufferMemory } from 'langchain/memory';
import { AgentStep, BaseMessage } from 'langchain/schema';

import { ChatPromptTemplate } from 'langchain/prompts';
import { renderTextDescription } from 'langchain/tools/render';

import { formatLogToString } from 'langchain/agents/format_scratchpad/log';
import { ReActSingleInputOutputParser } from 'langchain/agents/react/output_parser';
import { RunnableSequence } from 'langchain/schema/runnable';

export class AiAgentService {
  // constructor() {}

  buildAgent = async (
    model: ChatOpenAI,
    agentPrompt: string,
    tools: Array<DynamicTool>,
    memory: BufferMemory
  ) => {
    /** Bind a stop token to the model */
    const modelWithStop = model.bind({
      stop: ['\nObservation'],
    });

    const prompt = ChatPromptTemplate.fromMessages([['system', agentPrompt]]);

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

    return AgentExecutor.fromAgentAndTools({
      agent: runnableAgent,
      tools,
      memory,
    });
  };
}
