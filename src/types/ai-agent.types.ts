import { ObjectId } from 'mongodb';

export type AiConversationStatus = 'active' | 'archived';
export type AiMessageRole = 'user' | 'assistant';
export type AiMessageKind = 'text' | 'image' | 'welcome';
export type AiRunStatus = 'running' | 'completed' | 'failed';

export interface AiConversation {
  _id?: ObjectId;
  userId: ObjectId;
  threadId: string;
  status: AiConversationStatus;
  graphVersion: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
  lease?: {
    owner: string;
    expiresAt: Date;
  };
}

export interface AiConversationMessage {
  _id?: ObjectId;
  conversationId: ObjectId;
  userId: ObjectId;
  threadId: string;
  turnId: string;
  role: AiMessageRole;
  kind: AiMessageKind;
  content: string;
  clientRequestId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface AiRunOperation {
  key: string;
  status: 'completed' | 'failed';
  result?: unknown;
  error?: string;
  completedAt: Date;
}

export interface AiRun {
  _id?: ObjectId;
  runId: string;
  turnId: string;
  conversationId: ObjectId;
  userId: ObjectId;
  threadId: string;
  status: AiRunStatus;
  inputMessageId: ObjectId;
  outputMessageId?: ObjectId;
  route?: string;
  operations?: AiRunOperation[];
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface AiMessageInput {
  message: string;
  userId: string;
  clientRequestId?: string;
}

