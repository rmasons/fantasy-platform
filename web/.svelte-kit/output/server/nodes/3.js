import * as universal from '../entries/pages/standings/_page.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/standings/_page.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/standings/+page.ts";
export const imports = ["_app/immutable/nodes/3.2STMrupL.js","_app/immutable/chunks/4JnNrzVy.js","_app/immutable/chunks/xihTtKlq.js"];
export const stylesheets = [];
export const fonts = [];
