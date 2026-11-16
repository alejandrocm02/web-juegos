import { expect, test, type Page } from '@playwright/test';

/**
 * Pestaña congelada en mitad de una partida.
 *
 * Los navegadores congelan o frenan las pestañas en segundo plano. Mientras
 * tanto los mensajes del servidor se acumulan y al volver se procesan todos
 * seguidos. Antes eso se veía como varias rondas avanzando de golpe.
 *
 * Headless no permite ocultar una pestaña de verdad, así que se reproduce lo
 * que importa: se bloquea el hilo principal del invitado mientras el servidor
 * avanza de ronda y se comprueba qué ve al soltarlo.
 */
const BLOCK_MS = 24_000;

async function enterName(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Tu nombre').fill(name);
}

test('al volver de una pestaña congelada se salta a la ronda actual sin reproducir las perdidas', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  // Registra cada ronda que llega a pintarse en el invitado, con su hora.
  await guest.addInitScript(() => {
    const seen: Array<{ at: number; round: string }> = [];
    (window as unknown as { __rounds: typeof seen }).__rounds = seen;
    new MutationObserver(() => {
      const round = /Ronda\s*(\d+ \/ \d+)/i.exec(document.body.innerText)?.[1];
      if (round && seen.at(-1)?.round !== round) seen.push({ at: performance.now(), round });
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });

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

  await host.getByRole('button', { name: 'Quiz', exact: true }).click();
  await host.getByRole('button', { name: 'Estoy listo' }).click();
  await guest.getByRole('button', { name: 'Estoy listo' }).click();
  await host.getByRole('button', { name: /Iniciar Quiz/ }).click();

  const hostRound = host.locator('.hud-stat').filter({ hasText: 'Ronda' });
  const guestRound = guest.locator('.hud-stat').filter({ hasText: 'Ronda' });
  await expect(guestRound).toContainText('1 / 10', { timeout: 20_000 });

  // Una ronda del quiz dura unos 19,5 s: en 24 s el servidor avanza al menos una.
  const releasedAt = await guest.evaluate((ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      // Pestaña congelada: no se atiende ningún mensaje.
    }
    return performance.now();
  }, BLOCK_MS);
  await expect(hostRound).not.toContainText('1 / 10');

  // Al volver, el invitado llega enseguida a la ronda en la que está la sala.
  const current = (await hostRound.innerText()).match(/\d+ \/ \d+/)![0];
  await expect(guestRound).toContainText(current, { timeout: 2_000 });

  // Y no reproduce las rondas perdidas una tras otra: todo lo que se pinta
  // después de soltar la pestaña cabe en un instante.
  await guest.waitForTimeout(1_000);
  const rounds = await guest.evaluate(
    () => (window as unknown as { __rounds: Array<{ at: number; round: string }> }).__rounds,
  );
  const afterRelease = rounds.filter((entry) => entry.at >= releasedAt);
  expect(afterRelease.at(-1)?.round).toBe(current);
  for (const entry of afterRelease) expect(entry.at - releasedAt).toBeLessThan(500);
  await expect(guest.getByText(/Conexión perdida/)).toHaveCount(0);

  await hostContext.close();
  await guestContext.close();
});
