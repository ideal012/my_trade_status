// Runs before the page paints so the saved theme shows without a flash.
// No saved choice -> follow the operating system setting.
try {
  const saved = localStorage.getItem('theme');
  document.documentElement.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch {
  document.documentElement.dataset.theme = 'light';
}
