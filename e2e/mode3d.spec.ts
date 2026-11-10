import { expect, test, type Page } from '@playwright/test';

/**
 * Vista 3D de billar y bolos.
 *
 * La 3D es optativa y convive con la 2D. Aquí se comprueba lo que no puede
 * romperse: que `?mode=3d` la activa, que la partida sigue llegando del
 * servidor, que se puede volver a 2D sin salir de la partida y que un
 * navegador sin WebGL2 juega en 2D como si nada.
 */

async function practise(page: Page, game: string, search = '') {
  // Sin GPU, la vigilancia de fps tomaría al navegador de pruebas por un
  // dispositivo lento y volvería a 2D: se desactiva solo aquí.
  await page.addInitScript(() => {
    window.__ARCADE_NO_FPS_GUARD__ = true;
  });
  await page.goto('/' + search);
  await page.getByRole('button', { name: 'Practicar', exact: true }).click();
  await page.getByLabel('Tu nombre').fill('Tres D');
  const radio = page.getByRole('radio', { name: game, exact: true });
  if (!(await radio.isVisible()))
    await page.getByRole('button', { name: /Ver los 14 juegos/ }).click();
  await radio.click();
  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await page.getByRole('button', { name: 'Empezar ' + game, exact: true }).click();
}

const hasWebGL2 = (page: Page) =>
  page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/favicon|404/.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}

test('billar: ?mode=3d abre la mesa 3D y se puede volver a 2D sin salir de la partida', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await practise(page, 'Billar', '?mode=3d');
  test.skip(!(await hasWebGL2(page)), 'Este navegador de pruebas no tiene WebGL2');

  const board = page.locator('canvas[data-render="3d"]');
  await expect(board).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Cambiar vista' })).toBeVisible();

  // Golpe con teclado: flecha para preparar la puntería y espacio para tirar.
  await board.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(page.locator('.pool-console-copy strong')).not.toHaveText(
    'Prepara el primer golpe',
    {
      timeout: 30_000,
    },
  );

  await page.getByRole('button', { name: 'Volver a la vista 2D' }).click();
  await expect(
    page
      .getByRole('img', { name: 'Mesa de billar' })
      .or(page.getByLabel('Mesa de billar', { exact: true })),
  ).toBeVisible();
  await expect(board).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('bolos: la pista 3D pinta el lanzamiento que resuelve el servidor', async ({ page }) => {
  const errors = collectErrors(page);
  await practise(page, 'Bolos', '?mode=3d');
  test.skip(!(await hasWebGL2(page)), 'Este navegador de pruebas no tiene WebGL2');

  await expect(page.locator('canvas[data-render="3d"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Lanzar/ }).click();
  await expect(page.locator('.bowling-result')).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('sin WebGL2 se juega en 2D aunque se pida 3D', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await practise(page, 'Billar', '?mode=3d');

  await expect(page.getByLabel('Mesa de billar', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('canvas[data-render="3d"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /vista 3D/ })).toHaveCount(0);
});
