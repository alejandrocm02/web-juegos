import { expect, test } from '@playwright/test';

/**
 * Golpe de minigolf que termina fuera del lienzo.
 *
 * Algunos navegadores móviles y los lápices rechazan `setPointerCapture`. Sin
 * captura, el final del gesto solo llegaba al lienzo si se soltaba encima: al
 * soltar fuera el golpe no se enviaba y la bola parecía bloqueada. Se fuerza ese
 * rechazo para reproducirlo en Chromium de forma determinista.
 */
test('el golpe se envía aunque se suelte fuera del lienzo y el navegador rechace la captura', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    Element.prototype.setPointerCapture = function () {
      throw new DOMException('Captura no disponible', 'InvalidStateError');
    };
  });
  const page = await context.newPage();

  await page.goto('/');
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page.getByLabel('Tu nombre').fill('Golfista');
  await page.getByRole('radio', { name: 'Minigolf' }).click();
  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await page.getByRole('button', { name: /Empezar Minigolf/ }).click();

  const strokes = page.locator('.hud-stat').filter({ hasText: 'Golpes' });
  await expect(strokes).toContainText('0', { timeout: 20_000 });

  const course = page.locator('canvas').first();
  const box = (await course.boundingBox())!;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  // Se arrastra hasta salir del lienzo por la izquierda y se suelta ahí.
  await page.mouse.move(box.x - 40, centerY, { steps: 10 });
  await page.mouse.up();

  await expect(strokes).toContainText('1', { timeout: 10_000 });
  await context.close();
});
