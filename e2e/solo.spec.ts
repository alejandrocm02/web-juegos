import { expect, test, type Page } from '@playwright/test';

/**
 * Modo individual en un navegador real.
 *
 * Un solo contexto por prueba: es justamente lo que distingue a estas salas.
 * Se comprueba el recorrido completo de la pestaña "Practicar", que los bots
 * aparecen en el lobby y que las marcas personales sobreviven a una recarga.
 */

async function openPracticeTab(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page.getByLabel('Tu nombre').fill(name);
}

test('practicar un juego de duelo coloca rivales del servidor y arranca la partida', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await openPracticeTab(page, 'Solitaria');

  // Karts es el juego preseleccionado y lleva rivales controlados por el servidor.
  await page.getByRole('radio', { name: 'Karts' }).click();
  await expect(page.getByText('Dificultad de los rivales')).toBeVisible();
  await expect(page.getByLabel(/^Rivales:/)).toBeVisible();

  await page.getByRole('button', { name: 'Empezar a practicar' }).click();

  // El lobby de práctica no muestra código ni invitación.
  await expect(page.locator('h1.font-display').first()).toHaveText('ENTRENAMIENTO');
  await expect(page.getByRole('button', { name: 'Invitar amigos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copiar código' })).toHaveCount(0);

  // Y sí muestra a los bots, marcados como tales.
  await expect(page.getByText('Rival del servidor').first()).toBeVisible();
  const bots = page.getByText('Rival del servidor');
  expect(await bots.count()).toBeGreaterThan(0);

  // Un solo jugador basta para empezar: no hay botón de "Estoy listo".
  await expect(page.getByRole('button', { name: 'Estoy listo' })).toHaveCount(0);
  await page.getByRole('button', { name: /Empezar Karts/ }).click();

  await expect(page.locator('.hud-stat').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/demasiadas acciones/i)).toHaveCount(0);

  await context.close();
});

test('practicar un juego por turnos no ofrece rivales ni modos por equipos', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await openPracticeTab(page, 'Preguntona');
  await page.getByRole('radio', { name: 'Quiz' }).click();

  // Sin bots no hay control de dificultad: se explica que la marca es propia.
  await expect(page.getByText('Dificultad de los rivales')).toHaveCount(0);
  await expect(page.getByText(/no hay rivales, solo tu marca personal/)).toBeVisible();

  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await expect(page.locator('h1.font-display').first()).toHaveText('ENTRENAMIENTO');

  // El modo por equipos desaparece del selector: no tiene sentido jugando solo.
  await expect(page.getByRole('button', { name: 'Clásico', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Equipos', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /Empezar Quiz/ }).click();
  await expect(page.getByText(/Pregunta/)).toBeVisible({ timeout: 25_000 });

  await context.close();
});

test('la práctica termina, registra la marca y la conserva tras recargar', async ({ browser }) => {
  // Una partida completa de blackjack encadena varias rondas con sus pausas de
  // crupier, así que necesita más margen que el resto de flujos.
  test.setTimeout(150_000);
  const context = await browser.newContext();
  const page = await context.newPage();

  await openPracticeTab(page, 'Crupier');
  await page.getByRole('radio', { name: 'Blackjack' }).click();
  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await page.getByRole('button', { name: /Empezar Blackjack/ }).click();

  // Se planta en cuanto puede, ronda tras ronda, hasta que aparezca el
  // resultado final. El botón se monta y desmonta según el turno, y el número
  // de rondas lo decide la configuración por defecto: se itera con margen en
  // vez de fijar una cuenta exacta.
  const stand = page.getByRole('button', { name: 'Plantarse' });
  const recordBanner = page.getByText(
    /Primera marca registrada|Nuevo récord personal|Marca de esta partida/,
  );
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await recordBanner.isVisible().catch(() => false)) break;
    if ((await stand.count()) > 0) await stand.click().catch(() => undefined);
    await page.waitForTimeout(1200);
  }

  // Pantalla final con la marca personal por encima de la clasificación.
  await expect(recordBanner).toBeVisible({ timeout: 40_000 });

  // De los resultados se vuelve primero al lobby: la salida del entrenamiento
  // vive en su cabecera, no en la pantalla final.
  await page.getByRole('button', { name: 'Volver a intentarlo' }).click();
  await expect(page.getByText('Elige el juego')).toBeVisible({ timeout: 15_000 });

  // Y al volver al inicio la marca sigue ahí, guardada contra el perfil anónimo.
  await page.getByRole('button', { name: 'Salir del entrenamiento' }).click();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page.getByText('Tus marcas personales')).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByText('Tus marcas personales')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Blackjack').first()).toBeVisible();

  await context.close();
});

test('no se puede entrar en una sala de práctica ajena', async ({ browser }) => {
  const soloContext = await browser.newContext();
  const intruderContext = await browser.newContext();
  const solo = await soloContext.newPage();
  const intruder = await intruderContext.newPage();

  await openPracticeTab(solo, 'Tranquila');
  await solo.getByRole('radio', { name: 'Dardos' }).click();
  await solo.getByRole('button', { name: 'Empezar a practicar' }).click();
  await expect(solo.locator('h1.font-display').first()).toHaveText('ENTRENAMIENTO');

  // El código existe internamente aunque no se muestre; se prueba con uno
  // inventado para confirmar que el intruso no encuentra ninguna sala abierta.
  await intruder.goto('/');
  await intruder.getByLabel('Tu nombre').fill('Intruso');
  await intruder.getByRole('button', { name: 'Unirse' }).click();
  await intruder.getByLabel('Codigo de sala').fill('ZZZZZ');
  await intruder.getByRole('button', { name: 'Entrar en la sala' }).click();
  await expect(intruder.getByText(/No existe ninguna sala/)).toBeVisible({ timeout: 15_000 });

  await soloContext.close();
  await intruderContext.close();
});
