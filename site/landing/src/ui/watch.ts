// Watch 30 seconds: the film in a dialog with a close button top right. Esc closes it too (the
// dialog's own cancel), and closing pauses the film and gives focus back to the button that opened it.

export function watchFilm() {
  const dialog = document.getElementById('watch') as HTMLDialogElement | null;
  if (!dialog) return;
  const video = dialog.querySelector('video')!;
  document.querySelectorAll<HTMLElement>('[data-watch]').forEach((btn) =>
    btn.addEventListener('click', () => {
      dialog.showModal();
      video.muted = true;
      void video.play().catch(() => undefined);
    }),
  );
  dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => video.pause());
}
