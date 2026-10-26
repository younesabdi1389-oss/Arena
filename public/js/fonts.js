// Loads the Google Fonts stylesheet without blocking rendering. A render-blocking <link> in <head> stalls the
// whole page when fonts.googleapis.com is slow or unreachable; here the page paints first and the fonts swap in.
const HREF =
  'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700;800&family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = HREF;
link.addEventListener('error', () => console.warn('Web fonts could not be loaded; using system fonts instead.'));
document.head.append(link);
