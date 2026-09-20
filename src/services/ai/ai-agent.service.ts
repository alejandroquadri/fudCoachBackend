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
import {
  AiConversation,
  AiConversationMessage,
  AiProfile,
  ChatMsg,
  UserProfile,
} from '../../types';
import { AiGraphService } from './ai-graph.service';

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
    const leaseOwner = randomUUID();
    await this.acquireLease(conversation, leaseOwner);

    let runId: string | undefined;
    try {
      const existing = request.clientRequestId
        ? await this.messages.findUserRequest(
            conversation._id!,
            request.clientRequestId
          )
        : null;
      if (existing) {
        const answer = await this.messages.findAssistantForTurn(
          conversation._id!,
          existing.turnId
        );
        if (answer) return this.toChatMessage(answer);
      }

      const input =
        existing ??
        (await this.messages.create({
          conversationId: conversation._id!,
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

      let run = await this.runs.getByTurn(conversation._id!, input.turnId);
      if (!run) {
        runId = randomUUID();
        run = await this.runs.create({
          runId,
          turnId: input.turnId,
          conversationId: conversation._id!,
          userId: new ObjectId(request.userId),
          threadId: conversation.threadId,
          status: 'running',
          inputMessageId: input._id!,
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
            id: input._id!.toHexString(),
            content: input.content,
          }),
          runId,
          userId: request.userId,
          profile: this.toAgentProfile(user),
        },
        conversation.threadId
      );
      const content = this.lastAssistantText(result.messages);
      const output = await this.messages.create({
        conversationId: conversation._id!,
        userId: new ObjectId(request.userId),
        threadId: conversation.threadId,
        turnId: input.turnId,
        role: 'assistant',
        kind: 'text',
        content,
        clientRequestId: request.clientRequestId,
      });
      await this.runs.complete(runId, output._id!);
      return this.toChatMessage(output);
    } catch (error) {
      if (runId) await this.runs.fail(runId, this.errorMessage(error));
      throw error;
    } finally {
      if (runId) this.graph?.clearImage(runId);
      await this.conversations.releaseLease(conversation._id!, leaseOwner);
    }
  }

  async getMessages(userId: string): Promise<ChatMsg[]> {
    await this.initialize();
    const conversation = await this.conversations.getOrCreateActive(userId);
    const messages = await this.messages.list(conversation._id!);
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
    if (kind === 'welcome') {
      const existing = await this.messages.findWelcome(conversation._id!);
      if (existing) return this.toChatMessage(existing);
    }
    const turnId = randomUUID();
    const message = await this.messages.create({
      conversationId: conversation._id!,
      userId: new ObjectId(userId),
      threadId: conversation.threadId,
      turnId,
      role: 'assistant',
      kind,
      content,
      metadata,
    });
    await this.requireGraph().updateState(conversation.threadId, {
      messages: [new AIMessage({ id: message._id!.toHexString(), content })],
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
    const message = await this.messages.create({
      conversationId: conversation._id!,
      userId: new ObjectId(userId),
      threadId: conversation.threadId,
      turnId: randomUUID(),
      role: 'user',
      kind: 'text',
      content,
      metadata,
    });
    await this.requireGraph().updateState(conversation.threadId, {
      messages: [new HumanMessage({ id: message._id!.toHexString(), content })],
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
    conversation: AiConversation,
    owner: string,
    timeoutMs = 10_000
  ) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (
        await this.conversations.tryAcquireLease(
          conversation._id!,
          owner,
          120_000
        )
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

  private toAgentProfile(user: UserProfile): Record<string, unknown> {
    const {
      _id,
      email,
      password,
      providers,
      appleSub,
      appleEmailPrivateRelay,
      appAccountToken,
      entitlement,
      createdAt,
      updatedAt,
      ...profile
    } = user;
    return profile;
  }

  private toChatMessage(message: AiConversationMessage): ChatMsg {
    return {
      userId: message.userId,
      sender: message.role === 'assistant' ? 'ai' : 'user',
      content: message.content,
      timestamp: message.createdAt,
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const aiAgentService = new AiAgentService();
