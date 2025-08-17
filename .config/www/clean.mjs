import * as fs from "fs";

const markdownPaths = fs.globSync("./api/**/*.md");

const mdData = markdownPaths.map((markdown) => ({
	path: markdown,
	file: fs.readFileSync(markdown, { encoding: "utf8" }),
}));

const queries = [
	"> \\[!NOTE]",
	"> \\[!TIP]",
	"> \\[!IMPORTANT]",
	"> \\[!WARNING]",
	"> \\[!CAUTION]",
];

for (const { path, file } of mdData) {
	let foundQuery = undefined;
	const hasQuery = file.split("\n").some((line) => {
		foundQuery = queries.find((query) => line.includes(query));
		return foundQuery;
	});

	if (!hasQuery) continue;

	const newFile = file.replace(foundQuery, foundQuery.replace("\\", ""));

	fs.writeFileSync(path, newFile);
}
