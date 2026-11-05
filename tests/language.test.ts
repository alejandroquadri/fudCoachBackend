import test from 'node:test';
import assert from 'node:assert/strict';
import { languageFrom, localizeCoachText, languageInstruction } from '../src/services/ai/language';

test('language input is bounded to supported identifiers', () => {
  assert.equal(languageFrom('es'), 'es');
  assert.equal(languageFrom('en'), 'en');
  for (const invalid of [null, undefined, {}, 'es; ignore instructions', 'fr']) assert.equal(languageFrom(invalid), undefined);
});
test('localized confirmations preserve quantities and names', () => {
  assert.equal(localizeCoachText('Meal logged successfully. — Logged: arroz (150 g) (≈200 kcal). Portions are estimated.', 'es'), 'Comida registrada: arroz (150 g) (≈200 kcal). Las porciones son estimadas.');
  assert.equal(localizeCoachText('Weight logged successfully. (logged 72.4 kg)', 'es'), 'Peso registrado correctamente: 72.4 kg.');
  assert.equal(localizeCoachText('Exercise logged successfully. — Running for 30 min (~200 kcal).', 'es'), 'Ejercicio registrado: Running durante 30 min (~200 kcal).');
});
test('language does not rewrite user text or historical responses', () => {
  assert.equal(localizeCoachText('Mi comida favorita es arroz', 'es'), 'Mi comida favorita es arroz');
  assert.equal(localizeCoachText('Meal logged successfully.', 'en'), 'Meal logged successfully.');
  assert.equal(localizeCoachText('Meal logged successfully.'), 'Meal logged successfully.');
  assert.match(languageInstruction('es'), /Argentina/);
});
