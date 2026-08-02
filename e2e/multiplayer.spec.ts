import { expect, test, type Page } from '@playwright/test';

async function enterName(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Tu nombre').fill(name);
}

test('dos navegadores comparten sala, juegan al quiz y reconectan', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await enterName(host, 'Anfitriona');
  await host.getByRole('button', { name: 'Crear sala privada' }).click();

  const codeLocator = host.locator('h1.font-display').first();
  await expect(codeLocator).toHaveText(/^[A-Z0-9]{5}$/);
  const code = (await codeLocator.textContent())!.trim();

  await enterName(guest, 'Invitado');
  await guest.getByRole('button', { name: 'Unirse' }).click();
  await guest.getByLabel('Codigo de sala').fill(code);
  await guest.getByRole('button', { name: 'Entrar en la sala' }).click();

  await expect(host.getByText('Invitado')).toBeVisible();
  await expect(guest.getByText('Anfitriona')).toBeVisible();

  // El invitado no puede iniciar la partida.
  await expect(guest.getByRole('button', { name: /Iniciar/ })).toHaveCount(0);

  await host.getByRole('button', { name: 'Quiz', exact: true }).click();
  await host.getByRole('button', { name: 'Estoy listo' }).click();
  await guest.getByRole('button', { name: 'Estoy listo' }).click();
  await host.getByRole('button', { name: /Iniciar Quiz/ }).click();

  await expect(host.locator('.hud-stat').filter({ hasText: 'Ronda' })).toContainText(/1 \/ 10/, {
    timeout: 20_000,
  });
  await expect(guest.locator('.hud-stat').filter({ hasText: 'Ronda' })).toContainText(/1 \/ 10/, {
    timeout: 20_000,
  });

  // Reconexion: recargar mantiene la sesion gracias al token de localStorage.
  await guest.reload();
  await expect(guest.getByText(/Pregunta/)).toBeVisible({ timeout: 20_000 });

  await hostContext.close();
  await guestContext.close();
});

test('el minigolf arranca con 10 niveles y muestra el HUD', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await enterName(host, 'Golf1');
  await host.getByRole('button', { name: 'Crear sala privada' }).click();
  const code = (await host.locator('h1.font-display').first().textContent())!.trim();

  await enterName(guest, 'Golf2');
  await guest.getByRole('button', { name: 'Unirse' }).click();
  await guest.getByLabel('Codigo de sala').fill(code);
  await guest.getByRole('button', { name: 'Entrar en la sala' }).click();
  await expect(host.getByText('Golf2')).toBeVisible();

  await host.getByRole('button', { name: 'Minigolf', exact: true }).click();
  await host.getByRole('button', { name: 'Estoy listo' }).click();
  await guest.getByRole('button', { name: 'Estoy listo' }).click();
  await host.getByRole('button', { name: /Iniciar Minigolf/ }).click();

  await expect(host.locator('.hud-stat').filter({ hasText: 'Recorrido' })).toContainText('1/10', {
    timeout: 20_000,
  });
  await expect(guest.locator('.hud-stat').filter({ hasText: 'Recorrido' })).toContainText('1/10', {
    timeout: 20_000,
  });
  await expect(host.locator('.hud-stat').filter({ hasText: 'Par' })).toContainText('2');
  await expect(host.getByRole('button', { name: /Reiniciar bola/ })).toBeVisible();

  // El primer golpe debe llegar al servidor y confirmarse. Esta comprobación
  // evita que una resincronización en bucle agote el límite de mensajes.
  const course = host.locator('canvas').first();
  const box = await course.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await host.mouse.move(centerX, centerY);
  await host.mouse.down();
  await host.mouse.move(centerX - 100, centerY, { steps: 8 });
  await host.mouse.up();

  await expect(host.locator('.hud-stat').filter({ hasText: 'Golpes' })).toContainText('1');
  await expect(host.getByText('Golpe enviado…')).toHaveCount(0);
  await expect(host.getByText(/demasiadas acciones/i)).toHaveCount(0);

  await hostContext.close();
  await guestContext.close();
});

test('navegacion principal: seleccionar modo, entrar en partida y volver al lobby', async ({
  browser,
}) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await enterName(host, 'Anfitrion');
  await host.getByRole('button', { name: 'Crear sala privada' }).click();
  const code = (await host.locator('h1.font-display').first().textContent())!.trim();

  await enterName(guest, 'Invitada');
  await guest.getByRole('button', { name: 'Unirse' }).click();
  await guest.getByLabel('Codigo de sala').fill(code);
  await guest.getByRole('button', { name: 'Entrar en la sala' }).click();
  await expect(host.getByText('Invitada')).toBeVisible();

  // El selector de modo esta disponible para el anfitrion.
  await host.getByRole('button', { name: 'Bolos', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Corta', exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Corta', exact: true }).click();

  await host.getByRole('button', { name: 'Estoy listo' }).click();
  await guest.getByRole('button', { name: 'Estoy listo' }).click();
  await host.getByRole('button', { name: /Iniciar Bolos/ }).click();

  // Dentro de la partida aparece la barra con la salida.
  await expect(host.getByRole('button', { name: 'Volver al lobby' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(guest.getByRole('button', { name: 'Abandonar' })).toBeVisible();

  // Volver pide confirmacion porque afecta a los demas jugadores.
  await host.getByRole('button', { name: 'Volver al lobby' }).click();
  await expect(host.getByRole('alertdialog')).toBeVisible();
  await host.getByRole('button', { name: 'Terminar y volver' }).click();

  // Y se regresa al lobby real de la sala, no al historial del navegador.
  await expect(host.getByText('Elige el juego')).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByText('Elige el juego')).toBeVisible({ timeout: 15_000 });

  await hostContext.close();
  await guestContext.close();
});
