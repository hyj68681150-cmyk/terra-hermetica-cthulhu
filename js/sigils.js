
    // =========================================================================
    // 0. BESPOKE COPPERPLATE VECTOR SIGIL LIBRARY (ZERO EMOJIS!)
    // =========================================================================
    export const PANTHEON_SIGILS = {
      cthulhu: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" stroke-dasharray="3 2"/><polygon points="24,6 39.6,33 8.4,33"/><path d="M12 22 Q24 13 36 22 Q24 31 12 22 Z"/><line x1="24" y1="18" x2="24" y2="26"/><path d="M18 33 C14 39, 16 43, 20 41 M24 33 L24 44 M30 33 C34 39, 32 43, 28 41"/></svg>`,
      yogsothoth: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20"/><circle cx="24" cy="24" r="7"/><circle cx="24" cy="10" r="4"/><circle cx="36.1" cy="17" r="4"/><circle cx="36.1" cy="31" r="4"/><circle cx="24" cy="38" r="4"/><circle cx="11.9" cy="31" r="4"/><circle cx="11.9" cy="17" r="4"/><line x1="24" y1="14" x2="24" y2="34"/><line x1="15.3" y1="19" x2="32.7" y2="29"/><line x1="32.7" y1="19" x2="15.3" y2="29"/></svg>`,
      guardian: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="18" r="8"/><line x1="24" y1="4" x2="24" y2="44" stroke-width="2"/><line x1="16" y1="22" x2="32" y2="22" stroke-width="1.6"/><path d="M24 20 Q11 8 5 16 Q13 22 24 24"/><path d="M24 20 Q37 8 43 16 Q35 22 24 24"/><path d="M24 25 Q12 26 7 34 Q16 33 24 28"/><path d="M24 25 Q36 26 41 34 Q32 33 24 28"/></svg>`,
      scp3000: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><path d="M24 8 C35 8, 37 19, 24 24 C11 29, 13 40, 24 40 C32 40, 36 35, 36 30"/><polygon points="24,13 28,24 24,35 20,24"/></svg>`,
      mekhane: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="5"/><line x1="24" y1="5" x2="24" y2="11"/><line x1="24" y1="37" x2="24" y2="43"/><line x1="5" y1="24" x2="11" y2="24"/><line x1="37" y1="24" x2="43" y2="24"/><line x1="10.6" y1="10.6" x2="14.8" y2="14.8"/><line x1="33.2" y1="33.2" x2="37.4" y2="37.4"/><line x1="37.4" y1="10.6" x2="33.2" y2="14.8"/><line x1="14.8" y1="33.2" x2="10.6" y2="37.4"/></svg>`,
      scp2317: `<svg class="sigil-lg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="6"/><line x1="24" y1="5" x2="24" y2="18" stroke-width="2"/><line x1="38.8" y1="12.2" x2="33" y2="16.8" stroke-dasharray="2 2"/><line x1="42.5" y1="28.2" x2="35.5" y2="26.6" stroke-dasharray="2 2"/><line x1="32.2" y1="41.1" x2="28.8" y2="34.2" stroke-dasharray="2 2"/><line x1="15.8" y1="41.1" x2="19.2" y2="34.2" stroke-dasharray="2 2"/><line x1="5.5" y1="28.2" x2="12.5" y2="26.6" stroke-dasharray="2 2"/><line x1="9.2" y1="12.2" x2="15" y2="16.8" stroke-dasharray="2 2"/></svg>`,
      azathoth: `<svg class="sigil-lg" viewBox="0 0 48 48"><ellipse cx="24" cy="24" rx="20" ry="9" transform="rotate(25 24 24)"/><ellipse cx="24" cy="24" rx="20" ry="9" transform="rotate(-25 24 24)"/><circle cx="24" cy="24" r="6"/><line x1="24" y1="20" x2="24" y2="28"/><polygon points="24,5 21,12 27,12"/></svg>`,
      nyarlathotep: `<svg class="sigil-lg" viewBox="0 0 48 48"><polygon points="8,12 40,12 24,41"/><circle cx="24" cy="21" r="4.5"/><path d="M15 8 L24 4 L33 8"/><line x1="24" y1="25.5" x2="24" y2="34"/></svg>`
    };

    export const CITY_SIGILS = {
      rlyeh: `<svg class="ico-city" viewBox="0 0 14 14"><polygon points="7,1.5 12,4.5 12,9.5 7,12.5 2,9.5 2,4.5"/><circle cx="7" cy="7" r="2"/></svg>`,
      alexandria: `<svg class="ico-city" viewBox="0 0 14 14"><line x1="7" y1="2" x2="7" y2="12"/><polygon points="5,12 9,12 8.2,4.5 5.8,4.5"/><circle cx="7" cy="2.6" r="1.2"/></svg>`,
      site2000: `<svg class="ico-city" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4.2"/><circle cx="7" cy="7" r="1.4"/><line x1="7" y1="1.2" x2="7" y2="2.8"/><line x1="7" y1="11.2" x2="7" y2="12.8"/><line x1="1.2" y1="7" x2="2.8" y2="7"/><line x1="11.2" y1="7" x2="12.8" y2="7"/></svg>`,
      gate001: `<svg class="ico-city" viewBox="0 0 14 14"><line x1="7" y1="1.5" x2="7" y2="12.5"/><line x1="4" y1="5.2" x2="10" y2="5.2"/><path d="M2 8.5 Q7 4 12 8.5"/></svg>`,
      prague: `<svg class="ico-city" viewBox="0 0 14 14"><polygon points="7,1.5 11.5,7 7,12.5 2.5,7"/><circle cx="7" cy="7" r="1.5"/></svg>`,
      site13: `<svg class="ico-city" viewBox="0 0 14 14"><polygon points="7,1.5 12,10.5 2,10.5"/><polygon points="7,12.5 12,3.5 2,3.5"/></svg>`,
      cairo: `<svg class="ico-city" viewBox="0 0 14 14"><polygon points="7,2 12.5,11.5 1.5,11.5"/><circle cx="7" cy="8.2" r="1.4"/></svg>`,
      antarctica: `<svg class="ico-city" viewBox="0 0 14 14"><polygon points="7,1.5 8.6,5.4 12.6,5.6 9.5,8.2 10.5,12.2 7,9.9 3.5,12.2 4.5,8.2 1.4,5.6 5.4,5.4"/></svg>`,
      penglai: `<svg class="ico-city" viewBox="0 0 14 14"><path d="M3 11.5 L11 11.5 M3.8 8.2 L10.2 8.2 M4.8 5 L9.2 5 M7 1.5 L7 11.5"/></svg>`,
      baikal: `<svg class="ico-city" viewBox="0 0 14 14"><polygon points="4,2 10,2 12.5,7 10,12 4,12 1.5,7"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="7" y1="4.5" x2="7" y2="9.5"/></svg>`,
      arkham: `<svg class="ico-city" viewBox="0 0 14 14"><path d="M4.5 11.5 L4.5 5.5 L7 2 L9.5 5.5 L9.5 11.5 M2 11.5 Q7 9.8 12 11.5"/></svg>`,
      leng: `<svg class="ico-city" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.2"/><circle cx="7" cy="7" r="2.6"/><line x1="7" y1="1.8" x2="7" y2="4.4"/></svg>`
    };

    // =========================================================================
    
