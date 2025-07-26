#!/usr/bin/env node

import * as core from "@actions/core";

core.setOutput("environments", {
	["[preview] - test 1"]: "https://stephansama.info",
	["[preview] - test 2"]: "https://madprofessorblog.org",
});
