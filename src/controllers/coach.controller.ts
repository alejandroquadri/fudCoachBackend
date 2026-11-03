import { AiProfile, ChatMsg } from '../types';
import { aiAgentService } from '../services';
import sharp from 'sharp';
import { ContextBudgetError } from '../services/ai/ai-context';

export class CoachController {
  async initUserPreferences(userId: string, preferences: AiProfile) {
    try {
      return aiAgentService.initializePreferences(userId, preferences);
    } catch (error) {
      throw new Error(`Error inicializando preferencias: ${error}`);
    }
  }

  async getWelcomeMes(userId: string) {
    const mes = `Hi! I'm your AI nutrition assistant 🤖🥗  

I’m here 24/7 to help you stay accountable and reach your nutrition goals. You can share your meals with me through text or photos — I’ll estimate their calories and macronutrients and log them for you. You can also record your weight, and I’ll create a clean, easy-to-read chart so you can track your progress.

I can answer nutrition questions and help you build meal ideas based on your preferences — and I’ll remember what you like and what you don’t.

Just a quick note: I’m not a medical professional, and everything I provide is general wellness guidance. For medical conditions or therapeutic diets, please consult a licensed healthcare provider. You can review my methodology and sources by tapping the info button in the top right.

Ready to get started? 💪`;

    return aiAgentService.appendAssistantMessage(userId, mes, 'welcome', {
      kind: 'welcome_v1',
    });
  }

  getMessages = (userId: string) => {
    return aiAgentService.getMessages(userId);
  };
  getMessagePage = (
    userId: string,
    options: { limit?: number; before?: string }
  ) => aiAgentService.getMessagePage(userId, options);

  async coachResponse(
    message: string,
    userId: string,
    clientRequestId?: string
  ): Promise<ChatMsg> {
    try {
      return await aiAgentService.respond({
        message,
        userId,
        clientRequestId,
      });
    } catch (error) {
      if (error instanceof ContextBudgetError) throw error;
      throw new Error(`Error obteniendo respuesta de ai ${error}`);
    }
  }

  async parseImage(
    file: Express.Multer.File,
    userId: string,
    clientRequestId?: string,
    caption?: string
  ): Promise<ChatMsg> {
    try {
      const processed = await sharp(file.buffer, {
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      return await aiAgentService.respond({
        userId,
        message: caption?.trim() || '[User uploaded an image]',
        clientRequestId,
        image: {
          buffer: processed,
          mimeType: 'image/jpeg',
          filename: file.originalname,
        },
      });
    } catch (error) {
      if (error instanceof ContextBudgetError) throw error;
      console.log('Error parsing Image', error);
      throw new Error('Error parsing Image');
    }
  }

  getState(userId: string) {
    return aiAgentService.getState(userId);
  }

  resetConversation(userId: string) {
    return aiAgentService.resetConversation(userId);
  }

  appendAiMessage(
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    return aiAgentService.appendAssistantMessage(
      userId,
      content,
      'text',
      metadata
    );
  }

  appendHumanMessage(
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    return aiAgentService.appendHumanMessage(userId, content, metadata);
  }
}
