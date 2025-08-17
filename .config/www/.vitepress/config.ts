import { defineConfig } from "vitepress";

import typedocSidebar from "../api/typedoc-sidebar.json" with { type: "json" };

export default defineConfig({
	description:
		"Documentation on how to use the mad professor suite of utilities",
	head: [
		["link", { href: "/favicon.svg", rel: "icon" }],
		[
			"meta",
			{
				content:
					"https://og.madprofessorblog.org/api/foss/packages.png",
				property: "og:image",
			},
		],
	],
	ignoreDeadLinks: true,
	lastUpdated: true,
	markdown: {
		// https://github.com/vuejs/vitepress/discussions/3724#discussioncomment-8963669
		config(md) {
			const defaultCodeInline = md.renderer.rules.code_inline!;
			md.renderer.rules.code_inline = (
				tokens,
				idx,
				options,
				env,
				self,
			) => {
				tokens[idx].attrSet("v-pre", "");
				return defaultCodeInline(tokens, idx, options, env, self);
			};
		},
	},
	outDir: "../../dist",
	sitemap: { hostname: "https://actions.stephansama.info" },
	themeConfig: {
		footer: {
			copyright: `Copyright © ${new Date().getFullYear()} - @stephansama`,
			message: "Released under MIT license",
		},
		nav: [
			{
				link: "https://madprofessorblog.org",
				target: "_self",
				text: "Blog",
			},
		],
		search: { options: { detailedView: true }, provider: "local" },
		sidebar: [{ items: typedocSidebar, link: "/api", text: "API" }],
		socialLinks: [
			{
				icon: "bluesky",
				link: "https://bsky.app/profile/stephansama.bsky.social",
			},
			{
				icon: "linkedin",
				link: "https://www.linkedin.com/in/stephan-randle-38a30319a/",
			},
			{
				icon: "npm",
				link: "https://www.npmjs.com/~stephansama",
			},
			{
				icon: "github",
				link: "https://github.com/stephansama",
			},
		],
	},
	title: "@stephansama actions",
});
