export const supportedLanguages = ['en', 'es'] as const;
export type Language = typeof supportedLanguages[number];
export function languageFrom(value: unknown): Language | undefined {
  return typeof value === 'string' && supportedLanguages.includes(value as Language) ? value as Language : undefined;
}
export function languageInstruction(language?: Language | null): string {
  if (!language) return '';
  const descriptions: Record<Language, string> = { en: 'English', es: 'clear Latin American Spanish natural in Argentina (voseo, no Spain-specific wording)' };
  return `\nUse ${descriptions[language]} for all user-facing text and questions. Keep machine-readable enum values, identifiers and food matching queries in their required format. The app language takes precedence over conversation history.`;
}
const spanish: Record<string, string> = {
  'The pending meal was canceled. Nothing was logged.': 'Se canceló la comida pendiente. No se registró nada.',
  "I couldn't identify a meal to log. Please describe the foods and approximate amounts.": 'No pude identificar una comida para registrar. Describí los alimentos y las cantidades aproximadas.',
  'What foods and approximate amounts would you like to log?': '¿Qué alimentos y cantidades aproximadas querés registrar?',
  "I couldn't look up nutrition information right now, so I haven't logged this meal. Please try again shortly.": 'No pude consultar la información nutricional, así que no registré esta comida. Intentá de nuevo en unos momentos.',
  "I can't reliably log this usual meal for yesterday yet. Please enter it in your food diary for the correct date.": 'Todavía no puedo registrar esta comida habitual para ayer de forma confiable. Agregala a tu diario en la fecha correspondiente.',
  'Which usual meal did you have? I need your current time zone to select by weekday.': '¿Qué comida habitual comiste? Necesito tu zona horaria para elegir según el día.',
  'You have more than one usual meal for this day. Which one did you have?': 'Tenés más de una comida habitual para este día. ¿Cuál comiste?',
  'I could not find a usual meal for this day. What did you have?': 'No encontré una comida habitual para este día. ¿Qué comiste?',
  'Your previous request was saved successfully.': 'Tu solicitud anterior se guardó correctamente.',
  'Meal logged successfully.': 'Comida registrada correctamente.',
  'Could you describe the foods and how they were prepared more specifically?': '¿Podés describir los alimentos y cómo se prepararon con más detalle?',
};
const templates: Array<[RegExp, (...parts: string[]) => string]> = [
  [/^Weight logged successfully\. \(logged (.+) kg\)$/, n => `Peso registrado correctamente: ${n} kg.`],
  [/^Meal logged successfully\. — Logged: (.*) \(≈(.*) kcal\)\.( Portions are estimated\.)?$/, (items, kcal, estimated) => `Comida registrada: ${items} (≈${kcal} kcal).${estimated ? ' Las porciones son estimadas.' : ''}`],
  [/^Exercise logged successfully\. — (.*) for (.*) min \(~(.*) kcal\)\.$/, (name, duration, kcal) => `Ejercicio registrado: ${name} durante ${duration} min (~${kcal} kcal).`],
  [/^Preferences updated\. (.*)\.$/, details => `Preferencias actualizadas. ${details.replace(/\bname:/g, 'nombre:').replace(/\blikes:/g, 'gustos:').replace(/\bdislikes:/g, 'no te gusta:').replace(/\bnone\b/g, 'ninguno')}.`],
  [/^Approximately how much (.*) did you have\? A weight in grams or a household portion would help\.$/, name => `¿Cuánto ${name} comiste aproximadamente? Podés indicar gramos o una medida casera.`],
  [/^I couldn't find a reliable food match for (.*)\. Could you specify the brand, ingredients, or preparation\?$/, name => `No encontré una coincidencia confiable para ${name}. ¿Podés indicar la marca, los ingredientes o la preparación?`],
];
// Translate fixed application responses only; user text and existing chat history stay intact.
export function localizeCoachText(text: string, language?: Language | null): string {
  const resources: Partial<Record<Language, { strings: Record<string, string>; templates: typeof templates }>> = { es: { strings: spanish, templates } };
  const resource = language ? resources[language] : undefined;
  if (!resource) return text;
  if (resource.strings[text]) return resource.strings[text];
  for (const [pattern, render] of resource.templates) {
    const match = pattern.exec(text);
    if (match) return render(...match.slice(1));
  }
  return text;
}
