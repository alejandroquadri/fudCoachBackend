import { differenceInYears } from 'date-fns';
import { RegistrationData, TargetObj } from '../types';

export class TargetsCalcService {
  caloriesPerKg = 7750;

  // 4 calories per gram of carbs, 4 calories per gram of protein, 9 calories per gram of fat
  carbsPerCaloriesGram = 4;
  proteinPerCaloriesGram = 4;
  fatperCaloriesGram = 9;

  // 50% carbs, 30% protein, 20% fat over total calories
  macroBalance = {
    carbs: 0.5,
    protein: 0.3,
    fat: 0.2,
  };

  buildTargetObj = (data: RegistrationData): TargetObj => {
    const tdeeObj = this.tdeeCalc(data);
    console.log('este es el tdee', tdeeObj);
    const dailyCaloricTarget = tdeeObj.tdee - this.dailyCaloricDeltaCalc(data);
    const macroObj = this.macroNutrientsTargetCalc(dailyCaloricTarget);
    return {
      tdee: tdeeObj.tdee,
      bmr: tdeeObj.bmr,
      dailyCaloricTarget,
      dailyCarbsTarget: macroObj.carbs,
      dailyProteinTarget: macroObj.protein,
      dailyFatTarget: macroObj.fat,
    };
  };

  /* *
  Total Daily Energy Expenditure  
  */
  tdeeCalc = (data: RegistrationData) => {
    const sexFactor = data.sex === 'male' ? 5 : -161;
    const age = differenceInYears(new Date(), new Date(data.birthdate));
    const bmr = this.round(
      10 * data.weight + 6.25 * data.height - 5 * age + sexFactor,
      0
    );
    const tdee = this.round(bmr * data.lifestyle, 0);
    return { bmr, tdee };
  };

  dailyCaloricDeltaCalc = (data: RegistrationData): number => {
    const caloriesPerWeek = data.weightGoal * this.caloriesPerKg;
    console.log(
      'calories per week',
      caloriesPerWeek,
      data.weightGoal,
      this.caloriesPerKg
    );
    const caloriesPerDay = this.round(caloriesPerWeek / 7, 0);
    console.log('calories per day', caloriesPerDay);
    return caloriesPerDay;
  };

  macroNutrientsTargetCalc = (caloricTarget: number) => {
    const carbs = this.round(
      (this.macroBalance.carbs * caloricTarget) / this.carbsPerCaloriesGram,
      0
    );
    const protein = this.round(
      (this.macroBalance.protein * caloricTarget) / this.proteinPerCaloriesGram,
      0
    );
    const fat = this.round(
      (this.macroBalance.fat * caloricTarget) / this.fatperCaloriesGram,
      0
    );
    return { carbs, protein, fat };
  };

  round = (value: number, decimals: number): number => {
    let d: string | number = '1';
    for (let i = 0; i < decimals; i++) {
      d += '0';
    }
    d = Number(d);
    return Math.round((value + Number.EPSILON) * d) / d;
  };
}
