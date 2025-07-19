import { differenceInYears } from 'date-fns';
import { RegistrationData, TargetObj } from '../types';

export class TargetsCalcService {
  caloriesPerKg = 7700;

  // 4 calories per gram of carbs,
  // 4 calories per gram of protein,
  // 9 calories per gram of fat

  carbsPerCaloriesGram = 4;
  proteinPerCaloriesGram = 4;
  fatperCaloriesGram = 9;

  // 50% carbs, 30% protein, 20% fat over total calories
  macroBalance = {
    carbs: 0.5,
    protein: 0.3,
    fat: 0.2,
  };

  // New methods

  // BMR - basal metabolic rate (BMR) is the amount of energy (in kilocalories)
  // your body needs to perform its most basic life-sustaining functions
  // while at complete rest – think breathing, blood circulation,
  // cell production and temperature regulation.
  getBmr(
    birthdate: string,
    weight: number,
    height: number,
    sex: string
  ): number {
    const sexFactor = sex === 'male' ? 5 : -161;
    const age = differenceInYears(new Date(), new Date(birthdate));

    return this.round(10 * weight + 6.25 * height - 5 * age + sexFactor, 0);
  }

  /* *
  Total Daily Energy Expenditure  
  */
  getTdee = (bmr: number, lifestyle: number) => {
    return this.round(bmr * lifestyle, 0);
  };

  getMacroNutrientsTargets(caloricTarget: number) {
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
  }

  /**
   * Calculate daily caloric target based on TDEE and weight loss goal.
   * @param tdee - total daily energy expenditure (maintenance kcal)
   * @param weeklyWeightLossKg - desired weight loss per week in kilograms (0.1 to 1.5)
   * @returns daily kcal target
   */
  getDailyCaloricTarget(tdee: number, weeklyWeightLossKg: number): number {
    const dailyDeficit = (weeklyWeightLossKg * this.caloriesPerKg) / 7;
    return Math.round(tdee - dailyDeficit);
  }

  // Old methods

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

    // basal metabolic rate (BMR) is the amount of energy (in kilocalories)
    // your body needs to perform its most basic life-sustaining functions
    // while at complete rest – think breathing, blood circulation,
    // cell production and temperature regulation.
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
