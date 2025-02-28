import axios, { AxiosInstance } from 'axios';
import { AiUserPreferences } from '../types';

export class AiMicroserviceController {
  private axiosInstance: AxiosInstance;
  private baseURL = 'http://localhost:8000';

  constructor() {
    this.axiosInstance = axios.create({
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private setBaseUrl(url: string) {
    this.axiosInstance.defaults.baseURL = url;
  }

  async getAiResponse(prompt: string, user_id: string): Promise<string> {
    this.setBaseUrl(this.baseURL);
    const response = await this.axiosInstance.post('/process-prompt', {
      prompt,
      user_id,
    });
    return response.data;
  }

  async getMessages(userId: string) {
    this.setBaseUrl(this.baseURL);
    const response = await this.axiosInstance.post('/get-conversation', {
      user_id: userId,
    });
    return response.data;
  }

  async initStatePreferences(userId: string, preferences: AiUserPreferences) {
    this.setBaseUrl(this.baseURL);
    const response = await this.axiosInstance.post('/init-user-preferences', {
      user_id: userId,
      preferences,
    });
    return response.data;
  }
}
