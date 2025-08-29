import { ObjectId } from 'mongodb';

export interface ChatMsg {
  userId?: ObjectId;
  sender: 'ai' | 'user';
  content: string;
  timestamp?: Date;
}

export interface AiChatAnswer {
  output: 'string';
  intermediateSteps: Array<void | unknown>;
}

export interface AiState {
  messages: string[];
  preferences: Record<string, number | string | boolean>;
}
