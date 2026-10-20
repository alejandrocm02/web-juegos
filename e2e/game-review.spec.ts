import { expect, test } from '@playwright/test';
import { GAME_IDS, GAME_META, type GamePublicState } from '@arcade/shared';

/** Real server + tablet input; each game must accept an action and restart cleanly. */
for (const game of GAME_IDS) {
  test(`revisión: ${game} se juega y reinicia en tableta`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    const failed: string[] = [];
    let state: GamePublicState | null = null;
    let started = 0;
    let playerId = '';
    const actions: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(response.url() + ': ' + response.status());
    });
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') failed.push(request.url());
    });
    page.on('websocket', (socket) => {
      socket.on('framereceived', ({ payload }) => {
        const raw = payload.toString();
        if (!raw.startsWith('42')) return;
        const [event, value] = JSON.parse(raw.slice(2));
        if (event === 'session') playerId = value.playerId;
        if (event === 'game:state') state = value;
        if (event === 'game:started') {
          state = value.state;
          started += 1;
        }
        if (event === 'app:error') errors.push(value.message);
      });
      socket.on('framesent', ({ payload }) => {
        const raw = payload.toString();
        if (!raw.startsWith('42')) return;
        const [event, value] = JSON.parse(raw.slice(2));
        if (event === 'game:action') actions.push(value.type);
      });
    });
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'Practicar', exact: true }).click();
      await page.getByLabel('Tu nombre').fill('Prueba ' + game);
      if (
        !(await page.getByRole('radio', { name: GAME_META[game].name, exact: true }).isVisible())
      ) {
        await page.getByRole('button', { name: 'Ver los 14 juegos' }).click();
      }
      await page.getByRole('radio', { name: GAME_META[game].name, exact: true }).click();
      await page.getByRole('button', { name: 'Empezar a practicar' }).click();
      const start = page.getByRole('button', {
        name: 'Empezar ' + GAME_META[game].name,
        exact: true,
      });
      await start.click();
      await expect.poll(() => state?.game).toBe(game);
      await expect.poll(() => state?.phase).not.toBe('countdown');
      const before = state!;
      if (game === 'karts' || game === 'arena' || game.startsWith('head-')) {
        const label =
          game === 'karts' ? 'Acelerar' : game === 'arena' ? 'Derecha' : 'Mover derecha';
        const button = page.getByRole('button', { name: label, exact: true });
        await expect(button).toBeVisible();
        await button.focus();
        await page.keyboard.down('Space');
        await page.waitForTimeout(700);
        await page.keyboard.up('Space');
        await expect
          .poll(() => {
            if (state?.game === 'karts' && before.game === 'karts')
              return Math.hypot(
                state.karts.find((entry) => entry.playerId === playerId)!.x -
                  before.karts.find((entry) => entry.playerId === playerId)!.x,
                state.karts.find((entry) => entry.playerId === playerId)!.y -
                  before.karts.find((entry) => entry.playerId === playerId)!.y,
              );
            if (state?.game === 'arena' && before.game === 'arena')
              return Math.abs(
                state.fighters.find((entry) => entry.playerId === playerId)!.x -
                  before.fighters.find((entry) => entry.playerId === playerId)!.x,
              );
            if (
              (state?.game === 'head-soccer' || state?.game === 'head-basketball') &&
              (before.game === 'head-soccer' || before.game === 'head-basketball')
            )
              return Math.abs(
                state.players.find((entry) => entry.playerId === playerId)!.x -
                  before.players.find((entry) => entry.playerId === playerId)!.x,
              );
            return 0;
          })
          .toBeGreaterThan(1);
      } else if (game === 'bowling' || game === 'tanks' || game === 'blackjack') {
        await page
          .getByRole('button', {
            name: game === 'bowling' ? 'Lanzar bola' : game === 'tanks' ? 'Disparar' : 'Plantarse',
            exact: true,
          })
          .click();
        await expect.poll(() => state?.phase).not.toBe(before.phase);
      } else if (game === 'quiz' || game === 'songless') {
        if (game === 'songless')
          await page.getByRole('button', { name: 'Escuchar fragmento' }).click();
        await page.locator('.quiz-answer').first().click();
        await expect
          .poll(() =>
            state?.game === game && (state.game === 'quiz' || state.game === 'songless')
              ? state.answeredPlayerIds.includes(playerId) || state.phase === 'reveal'
              : false,
          )
          .toBe(true);
      } else {
        const board =
          game === 'darts' ? page.locator('.darts-board') : page.locator('canvas').first();
        const box = await board.boundingBox();
        expect(box).not.toBeNull();
        const x = box!.x + box!.width * (game === 'pool' ? 0.25 : 0.5);
        const y = box!.y + box!.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x - Math.min(80, box!.width / 5), y + 20, { steps: 8 });
        await page.mouse.up();
        await expect.poll(() => actions.length).toBeGreaterThan(0);
        if (game === 'golf')
          await expect
            .poll(() =>
              state?.game === 'golf'
                ? state.balls.find((entry) => entry.playerId === playerId)?.strokes
                : 0,
            )
            .toBeGreaterThan(0);
        if (game === 'pool') await expect.poll(() => state?.phase).toBe('simulating');
        if (game === 'darts')
          await expect
            .poll(() => (state?.game === 'darts' ? state.currentThrows.length : 0))
            .toBeGreaterThan(0);
        if (game === 'air-hockey' || game === 'table-tennis')
          await expect
            .poll(() =>
              state?.game === game
                ? state.paddles.find((entry) => entry.playerId === playerId)?.y
                : null,
            )
            .not.toBe(
              before.game === game
                ? before.paddles.find((entry) => entry.playerId === playerId)?.y
                : null,
            );
      }

      if (['karts', 'arena', 'bowling'].includes(game)) {
        const opaque = await page
          .locator('canvas')
          .evaluate(
            (canvas: HTMLCanvasElement) =>
              canvas
                .getContext('2d')!
                .getImageData(
                  Math.floor(canvas.width * 0.95),
                  Math.floor(canvas.height * 0.95),
                  1,
                  1,
                ).data[3],
          );
        expect(opaque).toBeGreaterThan(0);
      }
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1024 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${game}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Volver al lobby' }).click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Terminar y volver' }).click();
      await expect(start).toBeVisible();
      await start.click();
      await expect.poll(() => started).toBe(2);
      expect(errors).toEqual([]);
      expect(failed).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
