import { expect, test, type WebSocketRoute } from '@playwright/test';
import { GAME_META } from '@arcade/shared';

/**
 * El aviso destacado («¡GOL!», «Strike»…) debe salir sobre el tablero y no
 * encima de la cabecera de la partida, también en un móvil en vertical, donde
 * la cabecera ocupa casi un tercio de la pantalla.
 *
 * Para no depender de que un bot marque, la prueba deja pasar el tráfico real
 * de Socket.IO y añade un `game:event` de gol como si lo enviara el servidor.
 */
test('el aviso de gol no tapa la cabecera en móvil', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  let socket: WebSocketRoute | null = null;
  await page.routeWebSocket(/socket\.io/, (route) => {
    route.connectToServer();
    socket = route;
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Practicar', exact: true }).click();
  await page.getByLabel('Tu nombre').fill('Prueba gol');
  const radio = page.getByRole('radio', { name: GAME_META['head-soccer'].name, exact: true });
  if (!(await radio.isVisible())) {
    await page.getByRole('button', { name: 'Ver los 14 juegos' }).click();
  }
  await radio.click();
  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await page
    .getByRole('button', { name: 'Empezar ' + GAME_META['head-soccer'].name, exact: true })
    .click();
  await expect(page.locator('.stage-head')).toBeVisible();
  await expect(page.locator('.stage-body canvas').first()).toBeVisible();
  await expect.poll(() => socket !== null).toBe(true);

  socket!.send(
    '42' + JSON.stringify(['game:event', { kind: 'head-score', value: 'Gol', team: 'rojo' }]),
  );

  const flash = page.locator('.stage-flash');
  await expect(flash).toBeVisible();
  await expect(flash).toContainText('¡Gol!');
  const flashBox = (await flash.boundingBox())!;
  const headBox = (await page.locator('.stage-head').boundingBox())!;
  const bodyBox = (await page.locator('.stage-body').boundingBox())!;

  // Debajo de la cabecera, dentro del tablero y sin salirse por los lados.
  expect(flashBox.y).toBeGreaterThanOrEqual(headBox.y + headBox.height);
  expect(flashBox.y).toBeGreaterThanOrEqual(bodyBox.y);
  expect(flashBox.x).toBeGreaterThanOrEqual(0);
  expect(flashBox.x + flashBox.width).toBeLessThanOrEqual(390);
  // Y a la vista sin tener que desplazarse.
  expect(flashBox.y + flashBox.height).toBeLessThanOrEqual(844);

  await context.close();
});
