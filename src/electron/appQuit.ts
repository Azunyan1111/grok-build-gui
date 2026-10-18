export type BeforeQuitEvent = {
  preventDefault(): void;
};

export function createBeforeQuitHandler(
  cleanup: () => Promise<void>,
  quit: () => void,
): (event: BeforeQuitEvent) => void {
  let allowQuit = false;
  let quitCleanup: Promise<void> | null = null;

  return (event) => {
    if (allowQuit) return;
    event.preventDefault();
    if (quitCleanup) return;
    quitCleanup = cleanup().finally(() => {
      allowQuit = true;
      quit();
    });
  };
}
