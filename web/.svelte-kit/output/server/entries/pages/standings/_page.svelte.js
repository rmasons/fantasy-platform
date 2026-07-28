import { b as escape_html, n as derived, o as stringify, r as ensure_array_like, t as attr_class, y as attr } from "../../../chunks/server.js";
//#region src/lib/components/StandingsTable.svelte
function StandingsTable($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { rows } = $$props;
		function rankStyle(rank) {
			if (rank === 1) return "text-amber-400 font-bold";
			if (rank === 2) return "text-slate-300 font-semibold";
			if (rank === 3) return "text-orange-600 font-semibold";
			return "text-slate-600";
		}
		function rowStyle(rank) {
			if (rank === 1) return "bg-amber-500/[0.07] border-l-2 border-amber-400/60";
			return "";
		}
		const hasTies = derived(() => rows.some((r) => r.ties > 0));
		const seasonStarted = derived(() => rows.some((r) => r.wins > 0 || r.losses > 0 || r.ties > 0));
		if (rows.length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="text-navy-500">No standings available yet — season may not have started.</p>`);
		} else {
			$$renderer.push("<!--[-1-->");
			if (!seasonStarted()) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<div class="mb-4 rounded-lg border border-navy-700 bg-navy-850 px-4 py-3 text-sm text-navy-500">Season hasn't started — standings will populate after Week 1.</div>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--> <div class="hidden sm:block overflow-x-auto rounded-lg border border-navy-700"><table class="w-full text-sm"><thead><tr class="bg-navy-900 text-navy-500 text-[10px] uppercase tracking-wider border-b border-navy-700"><th class="px-4 py-3 text-left w-8">#</th><th class="px-4 py-3 text-left">Team</th><th class="px-4 py-3 text-center">W</th><th class="px-4 py-3 text-center">L</th>`);
			if (hasTies()) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<th class="px-4 py-3 text-center">T</th>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--><th class="px-4 py-3 text-right">PF</th><th class="px-4 py-3 text-right">PA</th></tr></thead><tbody><!--[-->`);
			const each_array = ensure_array_like(rows);
			for (let i = 0, $$length = each_array.length; i < $$length; i++) {
				let row = each_array[i];
				$$renderer.push(`<tr${attr_class(`border-t border-navy-700/50 hover:bg-navy-800 transition-colors ${stringify(rowStyle(row.rank))} ${i % 2 !== 0 ? "bg-navy-875" : ""}`)}><td class="px-4 py-3"><span${attr_class(`font-mono text-xs ${stringify(rankStyle(row.rank))}`)}>${escape_html(row.rank)}</span></td><td class="px-4 py-3"><div class="flex items-center gap-3">`);
				if (row.avatar) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<img${attr("src", row.avatar)} alt="" class="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/10"/>`);
				} else {
					$$renderer.push("<!--[-1-->");
					$$renderer.push(`<div class="w-9 h-9 rounded-full bg-navy-800 flex items-center justify-center shrink-0 text-base">🏈</div>`);
				}
				$$renderer.push(`<!--]--> <div><p class="font-semibold text-white leading-tight">${escape_html(row.teamName)}</p> `);
				if (row.ownerName && row.ownerName !== row.teamName) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<p class="text-xs text-navy-500">${escape_html(row.ownerName)}</p>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--></div></div></td><td class="px-4 py-3 text-center font-mono font-bold text-white tabular-nums">${escape_html(row.wins)}</td><td class="px-4 py-3 text-center font-mono text-slate-500 tabular-nums">${escape_html(row.losses)}</td>`);
				if (hasTies()) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<td class="px-4 py-3 text-center font-mono text-navy-500 tabular-nums">${escape_html(row.ties)}</td>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--><td${attr_class(`px-4 py-3 text-right font-mono tabular-nums ${row.rank === 1 ? "text-amber-400 font-semibold" : "text-slate-200"}`)}>${escape_html(row.fpts.toFixed(2))}</td><td class="px-4 py-3 text-right font-mono text-navy-500 tabular-nums">${escape_html(row.fptsAgainst.toFixed(2))}</td></tr>`);
			}
			$$renderer.push(`<!--]--></tbody></table></div> <div class="sm:hidden space-y-2"><!--[-->`);
			const each_array_1 = ensure_array_like(rows);
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let row = each_array_1[$$index_1];
				$$renderer.push(`<div${attr_class(`bg-navy-850 rounded-lg border border-navy-700 px-4 py-3 flex items-center gap-3 ${stringify(rowStyle(row.rank))}`)}><span${attr_class(`font-mono text-xs w-5 text-center shrink-0 ${stringify(rankStyle(row.rank))}`)}>${escape_html(row.rank)}</span> `);
				if (row.avatar) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<img${attr("src", row.avatar)} alt="" class="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-white/10"/>`);
				} else {
					$$renderer.push("<!--[-1-->");
					$$renderer.push(`<div class="w-10 h-10 rounded-full bg-navy-800 flex items-center justify-center shrink-0">🏈</div>`);
				}
				$$renderer.push(`<!--]--> <div class="flex-1 min-w-0"><p class="font-semibold text-white text-sm truncate">${escape_html(row.teamName)}</p> <p class="text-xs text-navy-500">${escape_html(row.ownerName)}</p></div> <div class="text-right shrink-0"><p class="font-bold text-white text-sm tabular-nums">${escape_html(row.wins)}–${escape_html(row.losses)}${escape_html(row.ties > 0 ? `–${row.ties}` : "")}</p> <p class="text-xs text-navy-500 tabular-nums">${escape_html(row.fpts.toFixed(0))} pts</p></div></div>`);
			}
			$$renderer.push(`<!--]--></div>`);
		}
		$$renderer.push(`<!--]-->`);
	});
}
//#endregion
//#region src/routes/standings/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data } = $$props;
		$$renderer.push(`<div class="min-h-screen bg-navy-950 px-4 py-8 sm:px-6 lg:px-8"><div class="mx-auto max-w-4xl"><div class="mb-6"><h1 class="font-sport font-black text-5xl uppercase tracking-tight text-white leading-none">Standings</h1> <p class="text-navy-500 text-[10px] uppercase tracking-[0.2em] font-semibold mt-1">${escape_html(data.season)} Season</p></div> `);
		StandingsTable($$renderer, { rows: data.rows });
		$$renderer.push(`<!----></div></div>`);
	});
}
//#endregion
export { _page as default };
