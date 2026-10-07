const message = (action: string) => chrome.runtime.sendMessage({ target: 'background', action });
const status = document.getElementById('status')!;
for (const action of ['toggle', 'restore', 'mask-selection', 'setup']) document.getElementById(action)!.onclick = async () => {
  status.textContent = 'Working...';
  try {
    const reply = await message(action);
    if (!reply?.ok || reply.value?.error) throw new Error(reply?.error || reply.value.error);
    if (action === 'setup' || action === 'toggle' || action === 'restore') window.close();
    else status.textContent = 'Selection masked locally.';
  } catch (e) { status.textContent = e instanceof Error ? e.message : 'Action failed'; }
};
void chrome.commands.getAll().then(commands => {
  document.getElementById('shortcut')!.textContent = commands.find(c => c.name === 'toggle-redaction')?.shortcut || 'Assign a shortcut in setup';
});
export {};
