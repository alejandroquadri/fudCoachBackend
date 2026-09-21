import { randomUUID } from 'crypto';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { ObjectId } from 'mongodb';
import { mongoInstance } from '../../connection';
import {
  AiConversationModel,
  AiMessageModel,
  AiRunModel,
  UserModel,
} from '../../models';
import { AiConversationMessage, AiProfile, ChatMsg } from '../../types';
import { AiGraphService } from './ai-graph.service';
import { toAgentProfile } from './ai-utils';

type AgentRequest = {
  userId: string;
  message: string;
  clientRequestId?: string;
  image?: { buffer: Buffer; mimeType: string; filename?: string };
};

export class AiAgentService {
  private readonly conversations = new AiConversationModel();
  private readonly messages = new AiMessageModel();
  private readonly runs = new AiRunModel();
  private readonly users = new UserModel();
  private checkpointer?: MongoDBSaver;
  private graph?: AiGraphService;
  private initialization?: Promise<void>;

  initialize() {
    if (!this.initialization) this.initialization = this.initializeOnce();
    return this.initialization;
  }

  async respond(request: AgentRequest): Promise<ChatMsg> {
    await this.initialize();
    const user = await this.requireUser(request.userId);
    const conversation = await this.conversations.getOrCreateActive(
      request.userId
    );
    const conversationId = this.requireObjectId(
      conversation._id,
      'AI conversation'
    );
    const leaseOwner = randomUUID();
    await this.acquireLease(conversationId, leaseOwner);
    const leaseHeartbeat = setInterval(() => {
      void this.conversations
        .tryAcquireLease(conversationId, leaseOwner, 120_000)
        .catch(error => console.error('Unable to renew AI lease', error));
    }, 30_000);
    leaseHeartbeat.unref();

    let runId: string | undefined;
    try {
      const existing = request.clientRequestId
        ? await this.messages.findUserRequest(
            conversationId,
            request.clientRequestId
          )
        : null;
      if (existing) {
        const answer = await this.messages.findAssistantForTurn(
          conversationId,
          existing.turnId
        );
        if (answer) {
          const previousRun = await this.runs.getByTurn(
            conversationId,
            existing.turnId
          );
          if (previousRun && answer._id) {
            await this.runs.complete(previousRun.runId, answer._id);
          }
          return this.toChatMessage(answer);
        }
      }

      const input =
        existing ??
        (await this.messages.create({
          conversationId,
          userId: new ObjectId(request.userId),
          threadId: conversation.threadId,
          turnId: randomUUID(),
          role: 'user',
          kind: request.image ? 'image' : 'text',
          content: request.image ? '[User uploaded an image]' : request.message,
          clientRequestId: request.clientRequestId,
          metadata: request.image
            ? {
                mimeType: request.image.mimeType,
                filename: request.image.filename,
                byteLength: request.image.buffer.length,
              }
            : undefined,
        }));

      const inputId = this.requireObjectId(input._id, 'AI input message');
      let run = await this.runs.getByTurn(conversationId, input.turnId);
      if (!run) {
        runId = randomUUID();
        run = await this.runs.create({
          runId,
          turnId: input.turnId,
          conversationId,
          userId: new ObjectId(request.userId),
          threadId: conversation.threadId,
          status: 'running',
          inputMessageId: inputId,
        });
      } else {
        runId = run.runId;
        await this.runs.restart(runId);
      }

      if (request.image) {
        this.requireGraph().setImage(runId, request.image);
      }

      const result = await this.requireGraph().invoke(
        {
          message: new HumanMessage({
            id: inputId.toHexString(),
            content: input.content,
          }),
          runId,
          userId: request.userId,
          profile: toAgentProfile(user),
        },
        conversation.threadId
      );
      const content = this.lastAssistantText(result.messages);
      const output = await this.messages.create({
        conversationId,
        userId: new ObjectId(request.userId),
        threadId: conversation.threadId,
        turnId: input.turnId,
        role: 'assistant',
        kind: 'text',
        content,
        clientRequestId: request.clientRequestId,
      });
      await this.runs.complete(
        runId,
        this.requireObjectId(output._id, 'AI output message')
      );
      return this.toChatMessage(output);
    } catch (error) {
      if (runId) await this.runs.fail(runId, this.errorMessage(error));
      throw error;
    } finally {
      clearInterval(leaseHeartbeat);
      if (runId) this.graph?.clearImage(runId);
      await this.conversations.releaseLease(conversationId, leaseOwner);
    }
  }

  async getMessages(userId: string): Promise<ChatMsg[]> {
    await this.initialize();
    const conversation = await this.conversations.getOrCreateActive(userId);
    const messages = await this.messages.list(
      this.requireObjectId(conversation._id, 'AI conversation')
    );
    return messages.map(message => this.toChatMessage(message));
  }

  async initializePreferences(userId: string, profile: AiProfile) {
    await this.initialize();
    const conversation = await this.conversations.getOrCreateActive(userId);
    await this.requireGraph().updateState(conversation.threadId, {
      profile: profile as unknown as Record<string, unknown>,
    });
    return { state: profile };
  }

  async appendAssistantMessage(
    userId: string,
    content: string,
    kind: 'text' | 'welcome' = 'text',
    metadata?: Record<string, unknown>
  ) {
    await this.initialize();
    const conversation = await this.conversations.getOrCreateActive(userId);
    const conversationId = this.requireObjectId(
      conversation._id,
      'AI conversation'
    );
    if (kind === 'welcome') {
      const existing = await this.messages.findWelcome(conversationId);
      if (existing) return this.toChatMessage(existing);
    }
    const turnId = randomUUID();
    const message = await this.messages.create({
      conversationId,
      userId: new ObjectId(userId),
      threadId: conversation.threadId,
      turnId,
      role: 'assistant',
      kind,
      content,
      metadata,
    });
    await this.requireGraph().updateState(conversation.threadId, {
      messages: [
        new AIMessage({
          id: this.requireObjectId(message._id, 'AI message').toHexString(),
          content,
        }),
      ],
    });
    return this.toChatMessage(message);
  }

  async appendHumanMessage(
    userId: string,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    await this.initialize();
    const conversation = await this.conversations.getOrCreateActive(userId);
    const conversationId = this.requireObjectId(
      conversation._id,
      'AI conversation'
    );
    const message = await this.messages.create({
      conversationId,
      userId: new ObjectId(userId),
      threadId: conversation.threadId,
      turnId: randomUUID(),
      role: 'user',
      kind: 'text',
      content,
      metadata,
    });
    await this.requireGraph().updateState(conversation.threadId, {
      messages: [
        new HumanMessage({
          id: this.requireObjectId(message._id, 'AI message').toHexString(),
          content,
        }),
      ],
    });
  }

  async getState(userId: string) {
    await this.initialize();
    const conversation = await this.conversations.getOrCreateActive(userId);
    return this.requireGraph().getState(conversation.threadId);
  }

  async resetConversation(userId: string) {
    await this.initialize();
    const conversation = await this.conversations.startNew(userId);
    return { threadId: conversation.threadId };
  }

  private async initializeOnce() {
    this.checkpointer = new MongoDBSaver({
      client: mongoInstance.client,
      dbName: mongoInstance.db.databaseName,
      checkpointCollectionName: 'aiCheckpoints',
      checkpointWritesCollectionName: 'aiCheckpointWrites',
      enableTimestamps: true,
    });
    const errors = await this.checkpointer.setup();
    if (errors.length > 0) throw errors[0];
    await Promise.all([
      this.conversations.ensureIndexes(),
      this.messages.ensureIndexes(),
      this.runs.ensureIndexes(),
    ]);
    this.graph = new AiGraphService(this.checkpointer);
  }

  private async acquireLease(
    conversationId: ObjectId,
    owner: string,
    timeoutMs = 10_000
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (
        await this.conversations.tryAcquireLease(conversationId, owner, 120_000)
      ) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(
      'Another AI request is still running for this conversation'
    );
  }

  private async requireUser(userId: string) {
    if (!ObjectId.isValid(userId)) throw new Error('Invalid user ID');
    const user = await this.users.getUserById(userId);
    if (!user) throw new Error('No se encontró usuario');
    return user;
  }

  private requireGraph() {
    if (!this.graph) throw new Error('AI service has not been initialized');
    return this.graph;
  }

  private requireObjectId(id: ObjectId | undefined, entity: string) {
    if (!id) throw new Error(`${entity} was not persisted`);
    return id;
  }

  private lastAssistantText(messages: unknown[]) {
    for (const message of [...messages].reverse()) {
      if (AIMessage.isInstance(message)) {
        if (typeof message.content === 'string') return message.content;
        return message.content
          .flatMap(part =>
            part && typeof part === 'object' && 'text' in part
              ? [String(part.text)]
              : []
          )
          .join('\n');
      }
    }
    throw new Error('The AI graph did not return an assistant response');
  }

  private toChatMessage(message: AiConversationMessage): ChatMsg {
    return {
      userId: message.userId,
      sender: message.role === 'assistant' ? 'ai' : 'user',
      content: message.content,
      timestamp: message.createdAt,
      messageId: message._id?.toHexString(),
      turnId: message.turnId,
      kind: message.kind,
      metadata: message.metadata,
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const aiAgentService = new AiAgentService();
