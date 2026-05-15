import { readPackageHooks } from "@stephansama/pnpm-hooks";

/** @type {import('@stephansama/pnpm-hooks').types.PnpmFileHooks} */
export const hooks = {
	readPackage: readPackageHooks.pinAllDependencies,
};
