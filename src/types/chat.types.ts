import { ObjectId } from 'mongodb';
import type { AiMessageKind } from './ai-agent.types';

export interface ChatMsg {
  userId?: ObjectId;
  sender: 'ai' | 'user';
  content: string;
  timestamp?: Date;
  messageId?: string;
  turnId?: string;
  kind?: AiMessageKind;
  metadata?: Record<string, unknown>;
}

export interface AiChatAnswer {
  output: 'string';
  intermediateSteps: Array<void | unknown>;
}

export interface AiState {
  messages: string[];
  preferences: Record<string, number | string | boolean>;
}
