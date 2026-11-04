import { expect, test } from '@playwright/test';

/**
 * Cuenta atrás con el reloj del equipo desfasado.
 *
 * Los `deadline` llegan en hora del servidor. Si el cliente los compara con su
 * propio reloj, un equipo adelantado un minuto ve 0 s durante toda la pregunta.
 * Se simula ese equipo adelantando `Date.now()` antes de cargar la página.
 */
const SKEW_MS = 60_000;
const SECONDS_PER_QUESTION = 15;

test('el quiz muestra el tiempo del servidor aunque el reloj local vaya un minuto adelantado', async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript((skew) => {
    const realNow = Date.now.bind(Date);
    Date.now = () => realNow() + skew;
  }, SKEW_MS);
  const page = await context.newPage();

  await page.goto('/');
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page.getByLabel('Tu nombre').fill('Adelantada');
  await page.getByRole('radio', { name: 'Quiz' }).click();
  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await page.getByRole('button', { name: /Empezar Quiz/ }).click();

  await expect(page.getByText(/Pregunta/)).toBeVisible({ timeout: 25_000 });
  const clock = page.locator('.quiz-clock .hud-stat-value');
  await expect(clock).toBeVisible();

  const seconds = Number((await clock.textContent())?.replace(/\D/g, ''));
  // Sin corrección marcaría 0 s: el reloj local cree que el plazo pasó hace 45 s.
  expect(seconds).toBeGreaterThan(SECONDS_PER_QUESTION - 5);
  expect(seconds).toBeLessThanOrEqual(SECONDS_PER_QUESTION);

  await context.close();
});
