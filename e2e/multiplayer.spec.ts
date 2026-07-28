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

  await host.getByRole('button', { name: 'Quiz' }).first().click();
  await host.getByRole('button', { name: /Iniciar Quiz/ }).click();

  await expect(host.getByText(/Pregunta 1 \//)).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText(/Pregunta 1 \//)).toBeVisible({ timeout: 20_000 });

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

  await host.getByRole('button', { name: 'Minigolf' }).first().click();
  await host.getByRole('button', { name: /Iniciar Minigolf/ }).click();

  await expect(host.getByText(/Hoyo 1\/10/)).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText(/Hoyo 1\/10/)).toBeVisible({ timeout: 20_000 });
  await expect(host.getByText(/Colisiones:/)).toBeVisible();
  await expect(host.getByRole('button', { name: /Reiniciar bola/ })).toBeVisible();

  await hostContext.close();
  await guestContext.close();
});
