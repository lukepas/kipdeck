// Watch 30 seconds: the film in a dialog with a close button top right. Esc closes it too (the
// dialog's own cancel), and closing pauses the film and gives focus back to the button that opened it.
let opener: HTMLElement | null = null;

export function watchFilm() {
  const dialog = document.getElementById('watch') as HTMLDialogElement | null;
  if (!dialog) return;
  const video = dialog.querySelector('video')!;
  document.querySelectorAll<HTMLElement>('[data-watch]').forEach((btn) =>
    btn.addEventListener('click', () => {
      opener = btn;
      // The poster is fetched only now, so the first load never pays for a film nobody opened.
      if (!video.poster && video.dataset.poster) video.poster = video.dataset.poster;
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-close]')?.focus();
      video.muted = true;
      void video.play().catch(() => undefined);
    }),
  );
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    opener?.focus({ preventScroll: true });
    opener = null;
  });
}
