// Inline SVG icons for the HUD. Flat, simple shapes in the colorful style of
// inspiration/HUD-art.png. Every icon uses a 32×32 viewBox; UI glyphs that
// should follow the text color use `currentColor`.

const svg = (body, vb = '0 0 32 32') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

const OUT = '#1a2238'; // soft dark outline used on colorful item icons

export const ICONS = {
  pistol: svg(`<path d="M4 10h23v7H15l-3 12H6l3-12H4z" fill="#596573" stroke="${OUT}" stroke-width="1.2"/><path d="M6 12h18M18 17v5h-5" fill="none" stroke="#abb6bf" stroke-width="1.4"/>`),
  rifle: svg(`<path d="M2 10h7v3h5v-2h10v3h6v3H19l-2 10h-5l1-9H9v4H3z" fill="#596573" stroke="${OUT}" stroke-width="1.1"/><path d="M17 9h5M11 14h13" stroke="#b5bec5" stroke-width="1.4"/>`),
  heart: svg(`<path d="M16 28 C6 20 2 15.5 2 10.5 2 6.4 5.2 3.5 9 3.5c2.9 0 5.3 1.6 7 4 1.7-2.4 4.1-4 7-4 3.8 0 7 2.9 7 7C30 15.5 26 20 16 28z" fill="#ee4d5f"/>
    <path d="M7.5 8.5c1-1.6 2.6-2 3.8-1.6" stroke="#ff9aa6" stroke-width="2.2" stroke-linecap="round" fill="none"/>`),

  bones: svg(`<path d="M8.5 6.2a3 3 0 0 1 5 1.6l9 9a3 3 0 1 1 1.7 5 3 3 0 1 1-5 1.6l-9-9a3 3 0 1 1-1.7-5 3 3 0 0 1 0-3.2z" fill="#f2e8d0" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M23.5 6.2a3 3 0 0 0-5 1.6l-2.3 2.3 3.2 3.2 2.3-2.3a3 3 0 1 0 1.8-4.8z" fill="#e1d3b2" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 14.5l-3.4 3.4a3 3 0 1 0-1.8 4.8 3 3 0 0 0 5 1.6l3.4-3.4z" fill="#e1d3b2" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>`),

  tent: svg(`<path d="M16 4 3 27h26z" fill="#c98a4f" stroke="#1a2238" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M16 4v23M16 13l-5 14h10z" fill="#5a3a22" stroke="#1a2238" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M16 4l-2-2.5M16 4l2-2.5" stroke="#8a5a33" stroke-width="1.4" stroke-linecap="round"/>`),

  tower: svg(`<path d="M9 29 11 12h10l2 17z" fill="#a86b3c" stroke="#1a2238" stroke-width="1" stroke-linejoin="round"/>
    <path d="M7 12h18l-2-4H9z" fill="#8a5a33" stroke="#1a2238" stroke-width="1" stroke-linejoin="round"/>
    <path d="M8 8 16 2l8 6z" fill="#3c5078" stroke="#1a2238" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 17h8M11.5 22h9" stroke="#6b3f1e" stroke-width="1.2"/>`),

  knife: svg(`<path d="M6 26.5 9.5 23" stroke="#6b4228" stroke-width="4" stroke-linecap="round"/>
    <path d="M6 26.5 9.5 23" stroke="#c7995a" stroke-width="1.3" stroke-dasharray="1.6 1.4" stroke-linecap="round"/>
    <path d="M9 23.5 27 4.5c.8 3.8-.6 8.7-4.4 12.5L12.5 26.5z" fill="#c5cbd0" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 23.5 25 9.5" stroke="#eef1f3" stroke-width="1.1" stroke-linecap="round"/>`),

  bolt: svg(`<path d="M18.5 2 6 18h8l-2.5 12L26 13h-8.2L20.5 2z" fill="#ffc933" stroke="#e39a12" stroke-width="1.2" stroke-linejoin="round"/>`),

  spear: svg(`<path d="M5 28 L20 11" stroke="#9a5b2e" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M5 28 L20 11" stroke="#c07a42" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M17.2 11.6 29 3l-8.5 11.9z" fill="#d7dbe6" stroke="${OUT}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M29 3 20.5 14.9 19 13.3z" fill="#9aa1b5"/>
    <path d="M16.4 12.8l2.6 2.6M15 14.4l2.6 2.6" stroke="#6b3f1e" stroke-width="1.6" stroke-linecap="round"/>`),

  bow: svg(`<path d="M8 3c11 3 18 11 21 21" stroke="#9a5b2e" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M8 3c11 3 18 11 21 21" stroke="#c98a4f" stroke-width="1.1" stroke-linecap="round" fill="none"/>
    <path d="M8 3 29 24" stroke="#f3ead2" stroke-width="1" />
    <path d="M17.5 9.2l2.4 2.4" stroke="#6b3f1e" stroke-width="2.4" stroke-linecap="round"/>`),

  trap: svg(`<path d="M7 20V9M12.5 20V7M18 20V9M23.5 20V7" stroke="#b77a45" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M5.5 10 7 5.5 8.5 10M11 8 12.5 3.5 14 8M16.5 10 18 5.5 19.5 10M22 8l1.5-4.5L25 8" fill="#e8d3a8" stroke="#8a5a33" stroke-width="0.8" stroke-linejoin="round"/>
    <rect x="3" y="18" width="26" height="4.5" rx="1.6" fill="#9a5b2e" stroke="${OUT}" stroke-width="0.8"/>
    <rect x="3" y="24" width="26" height="4.5" rx="1.6" fill="#b77a45" stroke="${OUT}" stroke-width="0.8"/>
    <path d="M9 18.5 6 28M23 18.5 26 28" stroke="#6b3f1e" stroke-width="1.6" stroke-linecap="round"/>`),

  meat: svg(`<path d="M6.5 14.5C5 9 9.5 4.5 16 4.5c7.5 0 12 4.5 11 10.5-.9 5.6-6.4 10.5-13 10.5C8.8 25.5 7.6 19 6.5 14.5z" fill="#e2485a" stroke="${OUT}" stroke-width="1"/>
    <path d="M9 14.5c-.8-4 2.5-7.3 7.2-7.3 5.2 0 8.5 3.1 8 7.1-.5 4-4.4 7.2-9 7.2-3.9 0-5.4-3.7-6.2-7z" fill="#f26b7a"/>
    <circle cx="13.5" cy="13.5" r="3.4" fill="#fff4ec" stroke="#e7c9c0" stroke-width="0.8"/>
    <circle cx="13.5" cy="13.5" r="1.4" fill="#f1b9b9"/>
    <path d="M19 17.5c1.5-.3 2.6-1.3 3-2.6" stroke="#fff" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".75"/>`),

  hide: svg(`<path d="M9 5c2 2 4.5 2 7 2s5-0 7-2c1 2.5.5 4 2.5 5.5 2 1.5 3 1 3.5 3-2 1-2.5 2.5-2.5 5s1.5 4 0 6c-2 .2-3.5 1.5-4 3.5-2-.8-4-1-6.5-1s-4.5.2-6.5 1c-.5-2-2-3.3-4-3.5-1.5-2 0-3.5 0-6S5 14.5 3 13.5C3.5 11.5 4.5 12 6.5 10.5S8 7.5 9 5z" fill="#c98a4f" stroke="${OUT}" stroke-width="1"/>
    <path d="M11 11c3 1.2 7 1.2 10 0M10.5 17c3.5 1 7.5 1 11 0M12 22.5c2.5.6 5.5.6 8 0" stroke="#a86a35" stroke-width="1.4" stroke-linecap="round" fill="none"/>`),

  teeth: svg(`<path d="M9 4.5c4-1.5 10-1.5 14 0 .8 5-1 12-4.5 18.5-.8 1.6-1.6 3.8-2.5 5-.9-1.2-1.7-3.4-2.5-5C10 16.5 8.2 9.5 9 4.5z" fill="#fbf4e2" stroke="${OUT}" stroke-width="1"/>
    <path d="M12 7c.2 4.5 1.4 9.5 3.4 14" stroke="#e1d3b2" stroke-width="1.6" stroke-linecap="round" fill="none"/>`),

  plates: svg(`<path d="M3 26 9 8l6 18z" fill="#f08a3a" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M13 26 20 4l7.5 22z" fill="#6fb541" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M9 12v11M20 8.5V23" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".45"/>`),

  claws: svg(`<path d="M6 27c0-9 4-17 12-22 1.5-.9 2.6.4 1.6 1.6C14.5 12.5 12.5 19 12.5 27z" fill="#f4ecdc" stroke="${OUT}" stroke-width="1"/>
    <path d="M15 27c.4-7 3.4-13 9.3-16.8 1.4-.9 2.4.5 1.4 1.5C22 15.6 20.6 20.5 20.5 27z" fill="#e1d3b2" stroke="${OUT}" stroke-width="1"/>
    <rect x="4" y="25.5" width="19" height="4" rx="2" fill="#8a5a33"/>`),

  arrow: svg(`<path d="M5 27 25 7" stroke="#c07a42" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M22 5.5 29 3l-2.5 7z" fill="#cfd4e0" stroke="${OUT}" stroke-width="0.8" stroke-linejoin="round"/>
    <path d="M5 27l-1-5 3.2 1.2M5 27l5 1-1.2-3.2M8 24l-1.4-5 3.2 1.2M8 24l5 1.4-1.2-3.2" fill="#ee4d5f" stroke="#ee4d5f" stroke-width="1.4" stroke-linejoin="round"/>`),

  quiver: svg(`<path d="M11 8 8 2M16 7V1M21 8l3-6" stroke="#c07a42" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M7 3.5 8 1l1.6 2.2M14.6 2.2 16 0l1.4 2.2M22.4 3.2 24 1l1 2.5" fill="#ee4d5f" stroke="#ee4d5f" stroke-width="1.2"/>
    <path d="M8 8h16l-2 21H10z" fill="#9a5b2e" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M8.6 13h14.8M9.4 22h13.2" stroke="#6b3f1e" stroke-width="1.8"/>`),

  berry: svg(`<path d="M16 9c-1-3-.2-5.5 2.5-7" stroke="#3f7d2b" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M17 6c3-3.5 7-3.5 9-1.5-3 2.5-6 3-9 1.5z" fill="#6fbf45" stroke="${OUT}" stroke-width=".8"/>
    <circle cx="10.5" cy="17" r="6" fill="#e8323c" stroke="${OUT}" stroke-width="1"/>
    <circle cx="21.5" cy="17.5" r="6" fill="#e8323c" stroke="${OUT}" stroke-width="1"/>
    <circle cx="16" cy="24.5" r="6" fill="#d52631" stroke="${OUT}" stroke-width="1"/>
    <circle cx="8.6" cy="15" r="1.6" fill="#ffb3b8"/><circle cx="19.6" cy="15.5" r="1.6" fill="#ffb3b8"/><circle cx="14" cy="22.5" r="1.6" fill="#ffb3b8"/>`),

  mango: svg(`<path d="M16 8.5c0-2.5 1-4.5 3-5.5" stroke="#6b3f1e" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M17.5 6c3-3 7.5-3 9.5-.5-3.5 2.5-7 2.5-9.5.5z" fill="#6fbf45" stroke="${OUT}" stroke-width=".8"/>
    <path d="M16 8c7 0 11 5.5 10 12s-6 9.5-11 9.5S5 26 5.5 19 10 8 16 8z" fill="#ffab1f" stroke="${OUT}" stroke-width="1"/>
    <path d="M16 8c7 0 11 5.5 10 12-.4 2.6-1.6 4.6-3.2 6-1-9-4.5-14-10.4-17.2C13.6 8.3 14.8 8 16 8z" fill="#ff7a2a" opacity=".6"/>
    <ellipse cx="11.5" cy="15" rx="2" ry="3" fill="#ffe08a" transform="rotate(25 11.5 15)"/>`),

  dragon: svg(`<path d="M16 4.5c-1.8 2.2-1.6 4-1 5.5M12 6c-.3 2 0 3.5 1.2 4.6M20 6c.3 2 0 3.5-1.2 4.6" stroke="#58c46e" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <ellipse cx="16" cy="19" rx="10" ry="10.5" fill="#6a5cff" stroke="${OUT}" stroke-width="1"/>
    <path d="M6.5 15 3 12.5l5 .2M25.5 15l3.5-2.5-5 .2M7 24l-3.5 2 4.8-.6M25 24l3.5 2-4.8-.6M11 11 9 7.5l3.6 2.5M21 11l2-3.5-3.6 2.5M12 29l-.2 2.2 2-1.6M20 29l.2 2.2-2-1.6" fill="#58c46e" stroke="#58c46e" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M10 18c2-1 4-1 6 0M16 23c2-1 4-1 6 0M13 14c1.5-.8 3-.8 4.5 0" stroke="#b7a9ff" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="11" cy="14.5" r="1.4" fill="#fff" opacity=".8"/>`),

  marshberry: svg(`<path d="M16 10c-.6-3 .4-5.5 3-7" stroke="#7a2e2a" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M18 6.5c2.5-3 6-3.2 8-1.4-2.6 2.2-5.4 2.6-8 1.4z" fill="#6f8a46" stroke="${OUT}" stroke-width=".8"/>
    <circle cx="11" cy="18" r="5" fill="#8c1f3a" stroke="${OUT}" stroke-width="1"/>
    <circle cx="21" cy="18" r="5" fill="#a42a46" stroke="${OUT}" stroke-width="1"/>
    <circle cx="16" cy="25" r="5" fill="#8c1f3a" stroke="${OUT}" stroke-width="1"/>
    <circle cx="16" cy="13" r="4" fill="#a42a46" stroke="${OUT}" stroke-width="1"/>
    <circle cx="9.6" cy="16.4" r="1.3" fill="#e08ca0"/><circle cx="19.6" cy="16.4" r="1.3" fill="#e08ca0"/><circle cx="14.6" cy="23.4" r="1.3" fill="#e08ca0"/>`),

  swampfig: svg(`<path d="M16 8c0-2.5.6-4.2 2.2-5.4" stroke="#5a4a30" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M16 7.5c-2 2.5-4 5-6 8-3 4.5-1.5 13.5 6 13.5s9-9 6-13.5c-2-3-4-5.5-6-8z" fill="#6b3a6e" stroke="${OUT}" stroke-width="1"/>
    <path d="M12 15c-1.5 2.5-1.8 6-.6 8.5" stroke="#9a6a96" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <ellipse cx="16" cy="27.4" rx="2" ry="1" fill="#d8c0a0"/>`),

  glowlotus: svg(`<path d="M16 30V18" stroke="#4f8a46" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 18c-6 0-10-3-11-7 4 0 8 2 11 7zM16 18c6 0 10-3 11-7-4 0-8 2-11 7z" fill="#e8c0d8" stroke="${OUT}" stroke-width=".8"/>
    <path d="M9 12h14l-2.5 6h-9z" fill="#5f9a58" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="12.5" cy="12" r="1.6" fill="#7ffff0"/><circle cx="16" cy="11.4" r="1.6" fill="#7ffff0"/><circle cx="19.5" cy="12" r="1.6" fill="#7ffff0"/>
    <circle cx="16" cy="12" r="7" fill="#7ffff0" opacity=".18"/>`),

  fruit: svg(`<path d="M16 9c0-3 1-5 3-6" stroke="#6b3f1e" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M17 6c3-3 7-3 9-1-3 2.5-6.5 2.8-9 1z" fill="#6fbf45" stroke="${OUT}" stroke-width=".8"/>
    <path d="M16 10c-3-2-11-2-11 7 0 7 5 12 8 12 1.3 0 2-.6 3-.6s1.7.6 3 .6c3 0 8-5 8-12 0-9-8-9-11-7z" fill="#e8323c" stroke="${OUT}" stroke-width="1"/>
    <ellipse cx="10.5" cy="15.5" rx="2" ry="3" fill="#ff9aa2"/>`),

  crate: svg(`<rect x="4" y="7" width="24" height="20" rx="2" fill="#b77a45" stroke="${OUT}" stroke-width="1"/>
    <path d="M4 13.5h24M4 20.5h24" stroke="#8a5a33" stroke-width="1.6"/>
    <path d="M6 9l20 16" stroke="#8a5a33" stroke-width="2.4" stroke-linecap="round"/>`),

  quest: svg(`<circle cx="16" cy="16" r="14" fill="#ffc933" stroke="#e39a12" stroke-width="1.2"/>
    <rect x="13.6" y="6.5" width="4.8" height="12.5" rx="2.4" fill="#fff"/>
    <circle cx="16" cy="23.5" r="2.7" fill="#fff"/>`),

  dino: svg(`<path d="M22.5 4c2.4 0 4.5 1.2 4.5 2.8 0 1.2-1 2-2.5 2l-.5 5c.2 5.5-2.8 9.5-7.5 10.8l.3 4.4h-2.6l-.4-4c-1 .1-2 .1-3 0l-.5 4H8l.1-4.8C5 22.8 3.6 20.3 3 17c-.6-.2-1.8 1.8-3 1 1.5-2 2.3-5 5-6.8 3.5-2.4 9-1.2 12.4-1.5l1.3-4C19.3 4.8 20.8 4 22.5 4z" fill="#58b4a0" stroke="${OUT}" stroke-width="1"/>
    <circle cx="24" cy="6.6" r="0.9" fill="${OUT}"/>`),

  skull: svg(`<path d="M16 3C9 3 4.5 7.8 4.5 14c0 3.8 1.8 6.4 4 7.8V26c0 1 .8 1.8 1.8 1.8h11.4c1 0 1.8-.8 1.8-1.8v-4.2c2.2-1.4 4-4 4-7.8C27.5 7.8 23 3 16 3z" fill="#f4efe3" stroke="${OUT}" stroke-width="1.2"/>
    <ellipse cx="11" cy="14.5" rx="3" ry="3.4" fill="${OUT}"/><ellipse cx="21" cy="14.5" rx="3" ry="3.4" fill="${OUT}"/>
    <path d="M16 18.5l-1.8 3h3.6z" fill="${OUT}"/>
    <path d="M12.5 24.5v3M16 24.5v3M19.5 24.5v3" stroke="${OUT}" stroke-width="1.2"/>`),

  team: svg(`<circle cx="16" cy="9" r="5" fill="currentColor"/><path d="M6.5 27c0-6 4.2-10 9.5-10s9.5 4 9.5 10z" fill="currentColor"/>
    <circle cx="6.5" cy="11.5" r="3.6" fill="currentColor" opacity=".85"/><path d="M.5 25c0-4.5 2.6-7.4 6-7.4 1.2 0 2.3.3 3.2.9C7.6 20.4 6.4 22.6 6 25z" fill="currentColor" opacity=".85"/>
    <circle cx="25.5" cy="11.5" r="3.6" fill="currentColor" opacity=".85"/><path d="M31.5 25c0-4.5-2.6-7.4-6-7.4-1.2 0-2.3.3-3.2.9 2.1 1.9 3.3 4.1 3.7 6.5z" fill="currentColor" opacity=".85"/>`),

  person: svg(`<circle cx="16" cy="9.5" r="6.5" fill="currentColor"/><path d="M4.5 29c0-7.5 5-12.5 11.5-12.5S27.5 21.5 27.5 29z" fill="currentColor"/>
    <ellipse cx="13.5" cy="7.5" rx="2" ry="1.4" fill="#fff" opacity=".35"/>`),

  info: svg(`<circle cx="16" cy="16" r="14" fill="#3fb3ff" stroke="#1f7fc6" stroke-width="1.2"/>
    <circle cx="16" cy="9.5" r="2.4" fill="#fff"/><rect x="13.8" y="13.5" width="4.4" height="11" rx="2.2" fill="#fff"/>`),

  bag: svg(`<path d="M11 8V6.5C11 4 13 2.5 16 2.5s5 1.5 5 4V8" stroke="currentColor" stroke-width="2.2" fill="none"/>
    <rect x="5" y="8" width="22" height="21" rx="6" fill="none" stroke="currentColor" stroke-width="2.4"/>
    <path d="M9.5 17h13v7.5h-13z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M13.5 17v2.5M18.5 17v2.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`),

  map: svg(`<path d="M3 7l8-3 10 3 8-3v21l-8 3-10-3-8 3z" fill="#7ccb45" stroke="#fff8ea" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M11 4v21M21 7v21" stroke="#fff8ea" stroke-width="1.6"/>
    <path d="M5 12c2 1 4 0 5 1.5M13 16c2-1.5 4-1 6 .5M22.5 12c1.5 1 3 1 4.5 0" stroke="#ffc933" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    <circle cx="16" cy="11" r="1.8" fill="#ee4d5f"/>`),

  give: svg(`<path d="M2.5 20h5l6-2.5c1.5-.6 3 .2 3.3 1.5l6-2.2c1.6-.6 3 .6 2.3 2.1-.4.9-1.1 1.4-2 1.8l-9 4.3c-1.5.7-3 .9-4.6.6L7.5 25h-5z" fill="currentColor"/>
    <circle cx="20" cy="9" r="5" fill="#e8323c" stroke="#fff8ea" stroke-width="1.2"/><path d="M20 4.2c0-1.4.8-2.4 2-2.8" stroke="#7ccb45" stroke-width="1.6" stroke-linecap="round" fill="none"/>`),

  eat: svg(`<circle cx="16" cy="16" r="11.5" fill="none" stroke="currentColor" stroke-width="2.4"/>
    <path d="M10 18c1.5 3 3.5 4.5 6 4.5s4.5-1.5 6-4.5z" fill="currentColor"/>
    <circle cx="11.5" cy="12.5" r="1.8" fill="currentColor"/><circle cx="20.5" cy="12.5" r="1.8" fill="currentColor"/>`),

  home: svg(`<path d="M16 4 3 15.5h3.8V28h7v-7.5h4.4V28h7V15.5H29z" fill="currentColor" stroke-linejoin="round"/>`),

  check: svg(`<path d="M7 16.5l6 6L25.5 9" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),

  track: svg(`<path d="M16 29c-4.5 0-7-2.5-7-5.5 0-3.5 3-6 7-6s7 2.5 7 6c0 3-2.5 5.5-7 5.5z" fill="currentColor"/>
    <path d="M11 17 5 6.5c-.6-1 .6-2 1.5-1.2L13 13.5zM16 15.5 15 3c0-1.2 2-1.2 2 0l-1 12.5zM21 17l6-10.5c.6-1-.6-2-1.5-1.2L19 13.5z" fill="currentColor"/>`),

  trophy: svg(`<path d="M9 4h14v7c0 4.5-3 8-7 8s-7-3.5-7-8z" fill="#ffc933" stroke="#e39a12" stroke-width="1.2"/>
    <path d="M9 6.5H4.5c0 4 1.5 6.5 5 7M23 6.5h4.5c0 4-1.5 6.5-5 7" stroke="#ffc933" stroke-width="2.2" fill="none"/>
    <path d="M14 19h4v4h-4z" fill="#e39a12"/><rect x="9" y="23" width="14" height="5" rx="1.6" fill="#9a5b2e"/>
    <path d="M13 7.5v5" stroke="#fff4c2" stroke-width="2" stroke-linecap="round"/>`),

  clock: svg(`<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M16 9v7.5l5 3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/>`),

  weight: svg(`<path d="M9 11h14l4 17H5z" fill="currentColor"/><circle cx="16" cy="7" r="3.5" fill="none" stroke="currentColor" stroke-width="2.4"/>`),

  // --- boat + boat parts (relics)
  boat: svg(`<path d="M3 19h26l-4 7H8z" fill="#b77a45" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M3 19h26" stroke="#e0b03a" stroke-width="1.4"/>
    <path d="M16 3v16" stroke="#6b3f1e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M17 4c6 3 8 8 8 13h-8z" fill="#f4ecd6" stroke="${OUT}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M15 6c-4 3-6 7-6 11h6z" fill="#e8dcc0" stroke="${OUT}" stroke-width="0.9" stroke-linejoin="round"/>`),

  egg: svg(`<path d="M16 3c-6 0-10 9-10 15a10 10 0 0 0 20 0c0-6-4-15-10-15z" fill="#ffc933" stroke="#b07a10" stroke-width="1.2"/>
    <ellipse cx="12" cy="12" rx="2.2" ry="3.6" fill="#fff2b0" transform="rotate(-20 12 12)"/>
    <circle cx="19" cy="20" r="1.4" fill="#e0a21a"/><circle cx="14" cy="23" r="1" fill="#e0a21a"/>`),

  crystal: svg(`<path d="M16 2 22 12 18 29h-4L10 12z" fill="#6fe3ff" stroke="#1f7fa8" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M16 2v27M10 12h12" stroke="#bff5ff" stroke-width="0.9"/>
    <path d="M8 16l-4 5 3 7h4z" fill="#48c4f0" stroke="#1f7fa8" stroke-width="1" stroke-linejoin="round"/>
    <path d="M24 16l4 5-3 7h-4z" fill="#48c4f0" stroke="#1f7fa8" stroke-width="1" stroke-linejoin="round"/>`),

  propeller: svg(`<g stroke="#8a5d14" stroke-width="1" stroke-linejoin="round" fill="#d9a441">
    <path d="M16 16C12 9 12 4 16 3c4 1 4 6 0 13z"/>
    <path d="M16 16c-8 1-12 4-10 8 3 3 7 0 10-8z"/>
    <path d="M16 16c8 1 12 4 10 8-3 3-7 0-10-8z"/></g>
    <circle cx="16" cy="16" r="3.2" fill="#f0c86a" stroke="#8a5d14" stroke-width="1.1"/>`),

  wheel: svg(`<g stroke="#6b3f1e" stroke-width="2.4" stroke-linecap="round"><path d="M16 2v28M2 16h28M6 6l20 20M26 6 6 26"/></g>
    <circle cx="16" cy="16" r="9" fill="none" stroke="#9a6632" stroke-width="3.4"/>
    <circle cx="16" cy="16" r="3" fill="#c98a4f" stroke="#6b3f1e" stroke-width="1"/>`),

  anchor: svg(`<circle cx="16" cy="6" r="3" fill="none" stroke="#5d6674" stroke-width="2.2"/>
    <path d="M16 9v18M10 14h12" stroke="#7d8796" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M5 18c1 7 6 9 11 9s10-2 11-9" fill="none" stroke="#7d8796" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M3 20l2-3 3 2M29 20l-2-3-3 2" stroke="#5d6674" stroke-width="2" stroke-linecap="round" fill="none"/>`),

  sail: svg(`<path d="M6 25 9 5c8 2 15 8 17 20z" fill="#f2e6c8" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M12 11h5v5h-5z" fill="#d9c38e" stroke="#a88c52" stroke-width="0.8"/>
    <path d="M4 27h24" stroke="#9a6632" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 21c3-1 6-1 10 0" stroke="#c9b582" stroke-width="1" fill="none"/>`),

  rudder: svg(`<path d="M14 3h4v8h6c2 7 0 14-6 18h-4z" fill="#3b2f4a" stroke="#120c1a" stroke-width="1.1" stroke-linejoin="round"/>
    <path d="M18 13c3 0 4 3 3 7" stroke="#9b7cc9" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <rect x="12" y="2" width="8" height="3" rx="1" fill="#5a4a6a"/>`),
};

/** Resolve an icon id, falling back to `info`. */
export function icon(id) {
  return ICONS[id] || ICONS.info;
}

// Hat drawings for the four player slots (see config playerColors order).
const HATS = [
  // 0: brown ranger hat
  `<ellipse cx="32" cy="23" rx="27" ry="6.5" fill="#8a5a33" stroke="${OUT}" stroke-width="1.5"/>
   <path d="M17 22c0-9 5-14.5 15-14.5S47 13 47 22c-4 2-26 2-30 0z" fill="#a86b3c" stroke="${OUT}" stroke-width="1.5"/>
   <path d="M27 9.5c3 2 7 2 10 0" stroke="#8a5a33" stroke-width="2" fill="none" stroke-linecap="round"/>
   <path d="M17.5 18.5c5 2.5 24 2.5 29 0v3.5c-5 2.5-24 2.5-29 0z" fill="#5a3519"/>`,
  // 1: white cap with orange patch
  `<path d="M14.5 25c0-10 7.5-17 17.5-17s17.5 7 17.5 17z" fill="#f7f4ee" stroke="${OUT}" stroke-width="1.5"/>
   <path d="M44 24.5c5-.5 10 0 14 2.5-3 2.5-9 2.5-15 1.5z" fill="#ececec" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
   <circle cx="31" cy="17" r="5" fill="#ff8a2e"/><circle cx="32" cy="8.6" r="1.8" fill="#ff8a2e"/>`,
  // 2: cream pith helmet
  `<ellipse cx="32" cy="24.5" rx="23" ry="5" fill="#e6d6ad" stroke="${OUT}" stroke-width="1.5"/>
   <path d="M15 24c0-11 7.5-17.5 17-17.5S49 13 49 24c-5 2-29 2-34 0z" fill="#f3e6c2" stroke="${OUT}" stroke-width="1.5"/>
   <path d="M15.8 20c6 2 26.4 2 32.4 0l.4 3c-6 2.2-27 2.2-33.2 0z" fill="#c9a66b"/>
   <circle cx="32" cy="6.8" r="2" fill="#e6d6ad" stroke="${OUT}" stroke-width="1"/>`,
  // 3: green bucket hat
  `<path d="M9 27c3-5 8-6.5 23-6.5S52 22 55 27c-6 2.5-40 2.5-46 0z" fill="#3f7a31" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
   <path d="M17 22c0-9 6-14 15-14s15 5 15 14c-5 1.5-25 1.5-30 0z" fill="#4f9a3d" stroke="${OUT}" stroke-width="1.5"/>
   <path d="M17.5 18c5 1.8 24 1.8 29 0" stroke="#2f5e25" stroke-width="2.2" fill="none"/>`,
];

/** Portrait of the explorer: big round colored head, oval eyes, slot hat. */
export function portraitSvg(color, slot) {
  const hat = HATS[((slot % 4) + 4) % 4];
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <path d="M10 64c1-10 9-15 22-15s21 5 22 15z" fill="#e7c98a" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M26 49l6 7 6-7" fill="#fff5dc" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M17 52l4 12M47 52l-4 12" stroke="#8a5a33" stroke-width="3"/>
    <circle cx="32" cy="35" r="16.5" fill="${color}" stroke="${OUT}" stroke-width="1.5"/>
    <ellipse cx="25.5" cy="37" rx="2.4" ry="3.6" fill="#111"/>
    <ellipse cx="38.5" cy="37" rx="2.4" ry="3.6" fill="#111"/>
    <circle cx="24.8" cy="35.6" r=".8" fill="#fff"/><circle cx="37.8" cy="35.6" r=".8" fill="#fff"/>
    <ellipse cx="22" cy="30" rx="3.5" ry="2" fill="#fff" opacity=".22"/>
    ${hat}
  </svg>`;
}
