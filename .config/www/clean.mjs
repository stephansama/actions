import * as fs from "node:fs";
import * as fsp from "node:fs/promises";

const markdownPaths = fs.globSync("./api/**/*.md");

const queries = [
	"> \\[!NOTE]",
	"> \\[!TIP]",
	"> \\[!IMPORTANT]",
	"> \\[!WARNING]",
	"> \\[!CAUTION]",
];

for (const filepath of markdownPaths) {
	let foundQuery = undefined;
	const file = await fsp.readFile(filepath, { encoding: "utf8" });
	const hasQuery = file.split("\n").some((line) => {
		foundQuery = queries.find((query) => line.includes(query));
		return foundQuery;
	});

	if (!hasQuery) continue;

	const newFile = file.replace(foundQuery, foundQuery.replace("\\", ""));

	fs.writeFileSync(filepath, newFile);
}
