import { FoodToolPrompt } from './prompt.constant';
import { DynamicTool } from 'langchain/tools';
import { AiModel } from '../../models';

export class ToolsService {
  aiModel: AiModel;
  foodToolPrompt = FoodToolPrompt;

  constructor() {
    this.aiModel = new AiModel();
  }
  wheightTool = (id: string) =>
    new DynamicTool({
      name: 'Weight_Logs',
      description:
        'Call this tool to accurately record and recall any new weight log provided by the user. The input should be the number in kg of the new weight log',
      func: async w => {
        try {
          console.log(w);
          const weight = Number(w);
          const res = await this.aiModel.saveWeightLog(id, weight);
          console.log('peso guardado', res);
          return 'Weigh was logged';
        } catch (error) {
          return 'There was an error logging your new weight log';
        }
      },
    });

  foodLogTool = (id: string) =>
    new DynamicTool({
      name: 'Food_Logs',
      description: this.foodToolPrompt,
      func: async (obj: string) => {
        console.log(`inputs de funcion`, obj);
        try {
          await this.aiModel.saveFoodLog(id, obj);
          console.log('food log saved');
          return `Food log saved! ${obj}`;
        } catch (error) {
          return `error trying to save log: ${error}`;
        }
      },
    });

  nickNameSaveTool = (id: string) =>
    new DynamicTool({
      name: 'Nick_Name_Save',
      description:
        'Call this tool to accurately record and recall any new name or nickname provided by the user. The input should be the name or nickname. The input should always be a string.',
      func: async (nickname: string) => {
        try {
          await this.aiModel.saveOrUpdateProperty(id, 'nickName', nickname);
          console.log('nick guardado');
          return 'New name was saved';
        } catch (error) {
          return 'There was an error saving you name';
        }
      },
    });

  birthdaySaveTool = (id: string) =>
    new DynamicTool({
      name: 'Birthday_Save',
      description:
        'Call this tool to accurately record and recall the birthday date provided by the user. The input should be a string in the form "YYYY-MM-DD".',
      func: async (birthday: string) => {
        console.log(birthday);
        try {
          await this.aiModel.saveOrUpdateProperty(id, 'birthday', birthday);
          console.log('birthday guardado');
          return 'Birthday was saved';
        } catch (error) {
          return 'There was an error saving you birthday';
        }
      },
    });

  genderSaveTool = (id: string) =>
    new DynamicTool({
      name: 'Gender_Save',
      description:
        'Call this tool to accurately record and recall the gender provided by the user. The input should be a string that can be either "male" or "female".',
      func: async (gender: string) => {
        console.log(gender);
        try {
          await this.aiModel.saveOrUpdateProperty(id, 'gender', gender);
          console.log('gender guardado');
          return 'gender was saved';
        } catch (error) {
          return 'There was an error saving you gender';
        }
      },
    });

  qAndASaveTool = (id: string) =>
    new DynamicTool({
      name: 'Question_And_Answers_Save',
      description:
        'Call this tool to accurately record and recall your questions and the answers provided by the user. The input should be a string that summarizes the question and the answer".',
      func: async (qa: string) => {
        console.log(qa);
        try {
          await this.aiModel.upsertArrayPoperty(id, 'qAndAnswers', qa);
          console.log('question and answer guardado');
          return 'question and answer was saved';
        } catch (error) {
          return 'There was an error saving you question and answer';
        }
      },
    });

  endQASaveTool = (id: string) =>
    new DynamicTool({
      name: 'Gender_Save',
      description:
        'Call this tool to accurately record and recall once the questions have been completed by the user. The input should be "finished".',
      func: async (finished: string) => {
        console.log(finished);
        try {
          await this.aiModel.saveOrUpdateProperty(id, 'completedQA', true);
          console.log('completedQA guardado');
          return 'completedQA was saved';
        } catch (error) {
          return 'There was an error saving you completedQA';
        }
      },
    });
}
