import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { AiProfile, AiUserPreferences } from '../types';

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

  async getAiResponse(
    prompt: string,
    user_id: string
  ): Promise<{ response: string }> {
    this.setBaseUrl(this.baseURL);
    const response = await this.axiosInstance.post('/process-prompt', {
      prompt,
      user_id,
    });
    return response.data;
  }

  async parseImage(
    userId: string,
    image: Buffer
  ): Promise<{ response: string }> {
    // Forward to the AI microservice as multipart binary (NOT base64 here)
    const fd = new FormData();
    fd.append('user_id', userId);
    fd.append('image', image, {
      filename: `mobile_${Date.now()}.jpg`,
      contentType: 'image/jpeg',
    });
    this.setBaseUrl(this.baseURL);
    const response = await this.axiosInstance.post('/parse-image', fd, {
      headers: fd.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 20000,
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

  async initStatePreferences(userId: string, preferences: AiProfile) {
    this.setBaseUrl(this.baseURL);
    const response = await this.axiosInstance.post('/init-user-preferences', {
      user_id: userId,
      preferences,
    });
    return response.data;
  }
}
