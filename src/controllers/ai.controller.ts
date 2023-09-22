import { ChatMsg } from '../types';
import { AiService } from '../services';

export class AiController {
  aiService: AiService;
  mochMsgs: ChatMsg[] = [
    {
      type: 'user',
      content: 'Hi! How Are you doing?',
    },
    {
      type: 'ai',
      content: 'Hi! Fine. And you?',
    },
    {
      type: 'user',
      content: 'Very well! Thank you',
    },
    {
      type: 'ai',
      content: 'What is your name?',
    },
    {
      type: 'user',
      content: 'My name is Alex',
    },
    {
      type: 'ai',
      content: 'Where were you born?',
    },
    {
      type: 'user',
      content: 'In Buenos Aires, Argentina',
    },
    {
      type: 'ai',
      content: 'Oh! Beautiful city',
    },
  ];

  constructor() {
    this.aiService = new AiService();
  }

  coachResponse = async (message: string) => {
    return this.aiService.getAiResponse(message, this.mochMsgs);
    // return this.aiService.getAiResponse(message);
  };
}
